export const getFriendlyError = (errorMessage: string | undefined): string => {
  if (!errorMessage) return "Something went wrong. Please try again.";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("empty message") || msg.includes("empty")) return "We couldn't catch what you said. Could you try again?";
  if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) return "We're getting a lot of requests right now. Please wait a moment and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("backend")) return "Having trouble connecting. Please check your internet and try again.";
  if (msg.includes("transcription failed") || msg.includes("deepgram")) return "We couldn't catch what you said. Could you try speaking again?";
  if (msg.includes("microphone") || msg.includes("permission")) return "Microphone access is needed. Please allow microphone permissions and try again.";
  if (msg.includes("session expired") || msg.includes("401") || msg.includes("unauthorized")) return "Your session has expired. Please sign in again.";
  return "Something went wrong. Please try again.";
};
