// backend/src/generate.mjs
import OpenAI from "openai";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

import { makeDraftPrompt } from "./prompts.mjs";

const s3 = new S3Client({});
const ssm = new SSMClient({});
let openai; // initialized on first invocation

// ---- Paging & length targets ----
const WORDS_PER_PAGE = parseInt(process.env.WORDS_PER_PAGE || "350", 10);
const DEFAULT_MIN_PAGES = parseInt(process.env.MIN_PAGES || "10", 10);

// ---- Helpers ----
async function post(client, connectionId, data) {
  const command = new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(data))
  });
  await client.send(command);
}

function countWords(s) {
  return (s.match(/\b[\w’'-]+\b/g) || []).length;
}
function splitByMarkers(html) {
  return html.split(/<!--PAGE_BREAK-->/g);
}
function joinWithBreaks(segments) {
  return segments.join("<!--PAGE_BREAK-->");
}
function convertMarkersToBreaks(html) {
  return html.replaceAll("<!--PAGE_BREAK-->", '<div class="page-break"></div>');
}

// Ensure a proper doc skeleton + print CSS
function ensurePrintCss(fullHtml) {
  const styleBlock = `
<style>
  body { font: 11pt/1.5 system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif; color:#111; }
  h1,h2,h3 { margin: 1.2em 0 .5em; }
  ol { margin: 0 0 0 1.2em; }
  .page-break { page-break-after: always; }
  @page { margin: 1in; }
  @media screen { .page-break { border-top: 1px dashed #e5e7eb; margin: 28px 0; } }
</style>`.trim();

  const hasHead = /<head[\s>]/i.test(fullHtml);
  if (!hasHead) {
    const bodyContent = fullHtml.includes("<body")
      ? fullHtml
      : `<body>${fullHtml}</body>`;
    return `<!doctype html><html><head>${styleBlock}</head>${bodyContent}</html>`;
  }
  if (!/page-break-after\s*:\s*always/i.test(fullHtml)) {
    return fullHtml.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  }
  return fullHtml;
}

// Extract just BODY content (for safe recomposition)
function extractBodyFragment(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (m) return m[1];
  return html
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();
}

function wrapFullDoc(bodyHtml) {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    "<title>Contract</title>",
    "<style>",
    '  body { font: 11pt/1.5 system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif; color:#111; }',
    "  h1,h2,h3 { margin: 1.2em 0 .5em; }",
    "  ol { margin: 0 0 0 1.2em; }",
    "  .page-break { page-break-after: always; }",
    "  @page { margin: 1in; }",
    "  @media screen { .page-break { border-top: 1px dashed #e5e7eb; margin: 28px 0; } }",
    "</style>",
    "</head>",
    "<body>",
    bodyHtml,
    "</body>",
    "</html>"
  ].join("");
}

async function getOpenAIKey() {
  const name = process.env.OPENAI_PARAM_NAME || "/firstread/openai/api_key";
  const res = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );
  const val = res?.Parameter?.Value;
  if (!val) throw new Error("OpenAI key not found in SSM");
  return val;
}

export const handler = async (event) => {
  const { domainName, stage, connectionId } = event.requestContext || {};
  const mgmt = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`
  });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {}
  const {
    action = "start",
    key,
    prompt: userPromptRaw,
    targetPages: targetPagesRaw
  } = body;

  // -------- Presign --------
  if (action === "presign") {
    if (!key) {
      await post(mgmt, connectionId, {
        type: "error",
        message: "Missing key for presign."
      });
      return { statusCode: 400, body: "Missing key" };
    }
    const bucket = process.env.OUTPUT_BUCKET;
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 600 }
    );
    await post(mgmt, connectionId, { type: "presigned", key, s3Url: url });
    return { statusCode: 200, body: "Presigned" };
  }

  // -------- Stop --------
  if (action === "stop") {
    await post(mgmt, connectionId, { type: "status", value: "stopped" });
    return { statusCode: 200, body: "Stopped" };
  }

  // -------- Generate --------
  if (!openai) {
    try {
      const apiKey = await getOpenAIKey();
      openai = new OpenAI({ apiKey });
    } catch (e) {
      console.error("SSM / OpenAI init failed", e);
      await post(mgmt, connectionId, {
        type: "error",
        message: "Server init failed (SSM/OpenAI). Check logs."
      });
      return { statusCode: 500, body: "Init error" };
    }
  }

  const userPrompt =
    userPromptRaw || "Draft Terms of Service for a general SaaS provider.";
  if (userPrompt.length > 2000) {
    await post(mgmt, connectionId, {
      type: "error",
      message: "Prompt too long (2,000 char max)."
    });
    return { statusCode: 400, body: "Prompt too long" };
  }

  const targetPages = Math.max(
    3,
    Math.min(40, parseInt(targetPagesRaw || DEFAULT_MIN_PAGES, 10))
  );

  // Start generating immediately (no visible planning phase)
  await post(mgmt, connectionId, { type: "status", value: "generating" });

  const draftMsgs = makeDraftPrompt(userPrompt, targetPages);

  let htmlBuffer = "";
  let lastSentPage = 0;
  let model = process.env.OPENAI_MODEL || "gpt-4.1-2025-04-14";

  async function streamWithModel(usingModel) {
    const stream = await openai.chat.completions.create({
      model: usingModel,
      messages: draftMsgs,
      stream: true,
      temperature: 0.2
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (!delta) continue;

      htmlBuffer += delta;

      // live page progress (prefer markers)
      const segments = splitByMarkers(htmlBuffer);
      let currentPages = segments.length;
      if (currentPages <= 1) {
        const words = countWords(htmlBuffer);
        currentPages = Math.max(1, Math.floor(words / WORDS_PER_PAGE) + 1);
      }

      if (currentPages > lastSentPage) {
        lastSentPage = currentPages;
        await post(mgmt, connectionId, {
          type: "page",
          value: Math.min(currentPages, targetPages)
        });
      }

      await post(mgmt, connectionId, { type: "delta", htmlChunk: delta });
    }
  }

  try {
    try {
      await streamWithModel(model);
    } catch (primaryErr) {
      console.error(`Model ${model} failed; attempting fallback`, primaryErr);
      if (model !== "gpt-4.1-2025-04-14") {
        model = "gpt-4.1-2025-04-14";
        await streamWithModel(model);
      } else {
        throw primaryErr;
      }
    }
  } catch (err) {
    console.error(err);
    await post(mgmt, connectionId, {
      type: "error",
      message: "Generation failed. Please try again."
    });
    return { statusCode: 500, body: "Error" };
  }

  // ---- Post-process to EXACT pages ----
  let bodyFrag = extractBodyFragment(htmlBuffer);

  if (!/<!--PAGE_BREAK-->/.test(bodyFrag)) {
    const words = bodyFrag.split(/(\s+)/);
    let pagesSoFar = 1,
      wordCounter = 0;
    for (let i = 0; i < words.length && pagesSoFar < targetPages; i++) {
      if (/\S/.test(words[i])) wordCounter++;
      if (wordCounter >= WORDS_PER_PAGE) {
        words.splice(i + 1, 0, "<!--PAGE_BREAK-->");
        pagesSoFar++;
        wordCounter = 0;
        i++;
      }
    }
    bodyFrag = words.join("");
  }

  let segments = splitByMarkers(bodyFrag);
  if (segments.length > targetPages) {
    segments = segments.slice(0, targetPages);
    bodyFrag = joinWithBreaks(segments);
  } else if (segments.length < targetPages) {
    const deficit = targetPages - segments.length;
    try {
      const topUp = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        stream: false,
        messages: [
          ...makeDraftPrompt(userPrompt, deficit + 1),
          {
            role: "user",
            content: "Append ONLY body HTML, no <html>/<head>/<body>."
          },
          {
            role: "user",
            content: `Add exactly ${deficit} additional pages as Appendices. Use <!--PAGE_BREAK--> strictly between new pages and keep terminology consistent with the main document.`
          }
        ]
      });
      const more = extractBodyFragment(
        topUp.choices?.[0]?.message?.content || ""
      );
      const moreClean = more
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<\/?(html|head|body)[^>]*>/gi, "");
      bodyFrag = bodyFrag + "<!--PAGE_BREAK-->" + moreClean;
      segments = splitByMarkers(bodyFrag);
      if (segments.length > targetPages) {
        segments = segments.slice(0, targetPages);
        bodyFrag = joinWithBreaks(segments);
      }
    } catch (e) {
      console.error("Top-up continuation failed", e);
    }
  }

  const normalizedBody = convertMarkersToBreaks(bodyFrag);
  let finalHtml = wrapFullDoc(normalizedBody);
  finalHtml = ensurePrintCss(finalHtml);

  // authoritative page count
  await post(mgmt, connectionId, {
    type: "page",
    value: splitByMarkers(bodyFrag).length
  });

  // Upload + presign
  const bucket = process.env.OUTPUT_BUCKET;
  const outKey = `contracts/${Date.now()}-${connectionId}.html`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: outKey,
      Body: finalHtml,
      ContentType: "text/html; charset=utf-8"
    })
  );

  const presignedGetUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: outKey }),
    { expiresIn: 600 }
  );

  await post(mgmt, connectionId, {
    type: "complete",
    key: outKey,
    s3Url: presignedGetUrl
  });
  return { statusCode: 200, body: "OK" };
};
