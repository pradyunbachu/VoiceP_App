export const getFriendlyError = (errorMessage: string | undefined, statusCode?: number): string => {
  if (!errorMessage && !statusCode) return "Something went wrong. Please try again.";

  // Check HTTP status code first for unambiguous mapping
  if (statusCode === 429) return "We're getting a lot of requests right now. Please wait a moment and try again.";
  if (statusCode === 401 || statusCode === 403) return "Your session has expired. Please sign in again.";
  if (statusCode === 413) return "That file is too large. Please try a smaller one.";
  if (statusCode === 422) return "Some of the data wasn't quite right. Please check your input and try again.";

  if (!errorMessage) return "Something went wrong. Please try again.";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("empty message") || msg.includes("empty")) return "We couldn't catch what you said. Could you try again?";
  if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) return "We're getting a lot of requests right now. Please wait a moment and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("backend")) return "Having trouble connecting. Please check your internet and try again.";
  if (msg.includes("transcription failed") || msg.includes("deepgram")) return "We couldn't catch what you said. Could you try speaking again?";
  if (msg.includes("microphone") || msg.includes("permission")) return "Microphone access is needed. Please allow microphone permissions and try again.";
  if (msg.includes("session expired") || msg.includes("401") || msg.includes("unauthorized")) return "Your session has expired. Please sign in again.";
  if (msg.includes("validation") || msg.includes("invalid")) return "Some of the data wasn't quite right. Please check your input and try again.";
  return "Something went wrong. Please try again.";
};
