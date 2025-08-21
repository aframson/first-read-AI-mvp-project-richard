export const handler = async (event) => {
  // Cleanup if you persist connections (not needed for this simple MVP)
  return { statusCode: 200, body: 'Disconnected.' };
};
