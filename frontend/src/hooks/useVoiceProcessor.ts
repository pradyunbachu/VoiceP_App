import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCreateExpense, useCreateExpenseSimple, useChat, useRemovePurchasedItems } from "./index";
import { API_BASE_URL } from "../config/api";
import type { Expense, ChatResponse, ExpenseExtractionResult } from "../types";

const getFriendlyError = (errorMessage: string | undefined): string => {
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

const useVoiceProcessor = () => {
  const { getToken } = useAuth();
  const [transcript, setTranscript] = useState("");
  const [extractedExpense, setExtractedExpense] = useState<ExpenseExtractionResult | null>(null);
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState("");
  const [pendingPantryExpense, setPendingPantryExpense] = useState<Expense | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const createExpenseMutation = useCreateExpense();
  const createExpenseSimpleMutation = useCreateExpenseSimple();
  const chatMutation = useChat();
  const removePurchasedMutation = useRemovePurchasedItems();

  const loading = createExpenseMutation.isPending || createExpenseSimpleMutation.isPending || chatMutation.isPending || isTranscribing;

  const handleExpenseCreated = async (expenseData: ExpenseExtractionResult) => {
    let expenses: Expense[] = [];
    if (expenseData.expenses) {
      expenses = expenseData.expenses;
    } else if (expenseData.id) {
      expenses = [expenseData as unknown as Expense];
    }

    const allItems = expenses.map(exp => exp.items).filter(Boolean).join(', ');
    if (allItems) {
      try {
        await removePurchasedMutation.mutateAsync(allItems);
      } catch (error) {
        console.log('Note: Could not remove items from shopping list:', error);
      }
    }

    const foodCategories = ["groceries", "grocery", "dining", "restaurant", "food"];
    const groceryExpense = expenses.find(exp => {
      const category = (exp.category || "").toLowerCase();
      return foodCategories.some(cat => category.includes(cat));
    });

    if (groceryExpense) {
      setPendingPantryExpense(groceryExpense);
    }
  };

  const processExpenseSimple = async (transcriptText: string) => {
    try {
      const expenseData = await createExpenseSimpleMutation.mutateAsync(transcriptText);
      if (expenseData.expenses) {
        setExtractedExpense(expenseData as ExpenseExtractionResult);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      } else {
        const result: ExpenseExtractionResult = { expenses: [expenseData as unknown as Expense], count: 1, message: (expenseData as ExpenseExtractionResult).message };
        setExtractedExpense(result);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      }
    } catch (error) {
      console.error("Error with simple extraction:", error);
      setError("Could not extract expense information. Please try the manual input.");
    }
  };

  const processTranscript = async (transcriptText: string) => {
    setError("");
    setExtractedExpense(null);
    try {
      const expenseData = await createExpenseMutation.mutateAsync(transcriptText);
      if (expenseData.expenses) {
        setExtractedExpense(expenseData as ExpenseExtractionResult);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      } else {
        const result: ExpenseExtractionResult = { expenses: [expenseData as unknown as Expense], count: 1, message: (expenseData as ExpenseExtractionResult).message };
        setExtractedExpense(result);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      }
    } catch (err) {
      const e = err as Error;
      console.error("Error processing transcript:", e);
      setError(getFriendlyError(e.message));
      if (e.message?.includes("429") || e.message?.includes("quota")) {
        await processExpenseSimple(transcriptText);
      } else if (e.message !== "Failed to fetch") {
        try { await processExpenseSimple(transcriptText); } catch {
          setError("Something went wrong. Please try again or use manual input.");
        }
      }
    }
  };

  const processAudio = async (audioBlob: Blob, mimeType = "audio/webm") => {
    setIsTranscribing(true);
    setTranscript("");
    setExtractedExpense(null);
    setChatResponse(null);

    try {
      const token = await getToken();
      const formData = new FormData();
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("ogg")) extension = "ogg";
      formData.append("audio", audioBlob, `recording.${extension}`);

      const transcribeHeaders: Record<string, string> = {};
      if (token) transcribeHeaders["Authorization"] = `Bearer ${token}`;

      const transcriptResponse = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: "POST",
        headers: transcribeHeaders,
        credentials: "include",
        body: formData,
      });

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(`Deepgram transcription failed: ${transcriptResponse.status} - ${errorText}`);
      }

      const transcriptData = await transcriptResponse.json();
      const transcriptText = (transcriptData.transcript || "").trim();
      setTranscript(transcriptText);
      setIsTranscribing(false);

      if (!transcriptText) {
        setError("We couldn't catch what you said. Could you try speaking again?");
        return;
      }

      const chatResult = await chatMutation.mutateAsync(transcriptText);

      if (chatResult.intent === "expense_input" && (chatResult.data as Record<string, unknown>)?.route_to_expense) {
        const expenseData = await createExpenseMutation.mutateAsync(transcriptText);
        setExtractedExpense(expenseData as ExpenseExtractionResult);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      } else {
        setChatResponse(chatResult as ChatResponse);
      }
    } catch (err) {
      const e = err as Error;
      console.error("Error processing audio:", e);
      setError(getFriendlyError(e.message || "Unknown error occurred"));
    } finally {
      setIsTranscribing(false);
    }
  };

  const processManualInput = async (input: string): Promise<boolean> => {
    if (!input.trim()) { setError("Please enter your message"); return false; }
    setError(""); setTranscript(""); setExtractedExpense(null); setChatResponse(null);

    try {
      const chatResult = await chatMutation.mutateAsync(input);
      if (chatResult.intent === "expense_input" && (chatResult.data as Record<string, unknown>)?.route_to_expense) {
        const expenseData = await createExpenseMutation.mutateAsync(input);
        setExtractedExpense(expenseData as ExpenseExtractionResult);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      } else {
        setChatResponse(chatResult as ChatResponse);
      }
      return true;
    } catch (err) {
      const e = err as Error;
      console.error("Error processing manual input:", e);
      setError(getFriendlyError(e.message));
      return false;
    }
  };

  const clearState = () => {
    setTranscript("");
    setExtractedExpense(null);
    setChatResponse(null);
    setError("");
  };

  const dismissPantryModal = () => {
    setPendingPantryExpense(null);
  };

  return {
    transcript,
    extractedExpense,
    chatResponse,
    error,
    pendingPantryExpense,
    isTranscribing,
    loading,
    processAudio,
    processManualInput,
    clearState,
    setError,
    dismissPantryModal,
    setExtractedExpense,
    setPendingPantryExpense,
  };
};

export default useVoiceProcessor;
