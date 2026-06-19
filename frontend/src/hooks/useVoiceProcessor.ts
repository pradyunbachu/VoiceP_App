import { useState, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useCreateExpense, useCreateExpenseSimple, useChat, useChatConfirm, useRemovePurchasedItems } from "./index";
import { API_BASE_URL } from "../config/api";
import { getFriendlyError } from "../lib/friendlyError";
import type { Expense, ChatResponse, ExpenseExtractionResult, AgentAction, PendingAction, ChatTurn } from "../types";

const useVoiceProcessor = () => {
  const { getToken } = useAuth();
  const [transcript, setTranscript] = useState("");
  const [extractedExpense, setExtractedExpense] = useState<ExpenseExtractionResult | null>(null);
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState("");
  const [pendingPantryExpense, setPendingPantryExpense] = useState<Expense | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [expenseJustCreated, setExpenseJustCreated] = useState(0);

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const historyRef = useRef<ChatTurn[]>([]);
  const chatConfirmMutation = useChatConfirm();

  const createExpenseMutation = useCreateExpense();
  const createExpenseSimpleMutation = useCreateExpenseSimple();
  const chatMutation = useChat();
  const removePurchasedMutation = useRemovePurchasedItems();
  const abortControllerRef = useRef<AbortController | null>(null);
  const isProcessingRef = useRef(false);

  const loading = createExpenseMutation.isPending || createExpenseSimpleMutation.isPending || chatMutation.isPending || isTranscribing;

  const handleExpenseCreated = async (expenseData: ExpenseExtractionResult) => {
    setExpenseJustCreated((c) => c + 1);

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

  const appendHistory = (user: string, assistant: string) => {
    historyRef.current.push({ role: "user", content: user });
    if (assistant) historyRef.current.push({ role: "assistant", content: assistant });
    if (historyRef.current.length > 20) {
      historyRef.current = historyRef.current.slice(-20);
    }
  };

  const processAudio = async (audioBlob: Blob, mimeType = "audio/webm") => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsTranscribing(true);
    setTranscript("");
    setExtractedExpense(null);
    setChatResponse(null);
    setActions([]);
    setPending([]);

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
        signal: abortController.signal,
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

      const chatResult = await chatMutation.mutateAsync({ message: transcriptText, history: historyRef.current });
      appendHistory(transcriptText, chatResult.reply || chatResult.response_text || "");

      if (chatResult.intent === "expense_input" && (chatResult.data as Record<string, unknown>)?.route_to_expense) {
        const expenseData = await createExpenseMutation.mutateAsync(transcriptText);
        setExtractedExpense(expenseData as ExpenseExtractionResult);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      } else {
        setChatResponse(chatResult as ChatResponse);
        setActions(chatResult.actions ?? []);
        setPending(chatResult.pending ?? []);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const e = err as Error;
      console.error("Error processing audio:", e);
      setError(getFriendlyError(e.message || "Unknown error occurred"));
    } finally {
      setIsTranscribing(false);
      isProcessingRef.current = false;
    }
  };

  const processManualInput = async (input: string): Promise<boolean> => {
    if (!input.trim()) { setError("Please enter your message"); return false; }
    if (isProcessingRef.current) return false;
    isProcessingRef.current = true;
    setError(""); setTranscript(""); setExtractedExpense(null); setChatResponse(null);
    setActions([]); setPending([]);

    try {
      const chatResult = await chatMutation.mutateAsync({ message: input, history: historyRef.current });
      appendHistory(input, chatResult.reply || chatResult.response_text || "");

      if (chatResult.intent === "expense_input" && (chatResult.data as Record<string, unknown>)?.route_to_expense) {
        const expenseData = await createExpenseMutation.mutateAsync(input);
        setExtractedExpense(expenseData as ExpenseExtractionResult);
        handleExpenseCreated(expenseData as ExpenseExtractionResult);
      } else {
        setChatResponse(chatResult as ChatResponse);
        setActions(chatResult.actions ?? []);
        setPending(chatResult.pending ?? []);
      }
      return true;
    } catch (err) {
      const e = err as Error;
      console.error("Error processing manual input:", e);
      setError(getFriendlyError(e.message));
      return false;
    } finally {
      isProcessingRef.current = false;
    }
  };

  const clearState = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isProcessingRef.current = false;
    setTranscript("");
    setExtractedExpense(null);
    setChatResponse(null);
    setError("");
    setActions([]);
    setPending([]);
  };

  const dismissPantryModal = () => {
    setPendingPantryExpense(null);
  };

  const confirmPending = async (p: PendingAction): Promise<void> => {
    try {
      const result = await chatConfirmMutation.mutateAsync({
        ids: [p.id], pending, history: historyRef.current,
      });
      setPending((prev) => prev.filter((x) => x.id !== p.id));
      setActions((prev) => [...prev, ...(result.actions ?? [])]);
      if (result.reply || result.response_text) {
        setChatResponse((prev) => (prev ? { ...prev, response_text: result.reply || result.response_text } : result));
      }
      appendHistory(`(confirmed: ${p.summary})`, result.reply || result.response_text || "");
    } catch (err) {
      setError(getFriendlyError((err as Error).message));
    }
  };

  const cancelPending = (p: PendingAction): void => {
    setPending((prev) => prev.filter((x) => x.id !== p.id));
  };

  return {
    transcript,
    extractedExpense,
    chatResponse,
    error,
    pendingPantryExpense,
    isTranscribing,
    loading,
    expenseJustCreated,
    processAudio,
    processManualInput,
    clearState,
    setError,
    dismissPantryModal,
    setExtractedExpense,
    setPendingPantryExpense,
    actions,
    pending,
    confirmPending,
    cancelPending,
  };
};

export default useVoiceProcessor;
