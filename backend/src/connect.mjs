export const handler = async (event) => {
  // Accept all connections; optionally check auth here
  return { statusCode: 200, body: 'Connected.' };
};
