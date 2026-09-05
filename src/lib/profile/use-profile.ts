import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type { PilotRecord } from "./types";

/**
 * The signed-in pilot's record, loaded once and kept in step with the server.
 *
 * Every save returns the whole record as the server now holds it, and that is
 * what gets rendered — no optimistic update. When the question is "did my
 * licence upload" or "am I verified yet", showing what the server actually has
 * beats showing what the browser hoped happened.
 */
export interface ProfileState {
  loading: boolean;
  error: string | null;
  saving: boolean;
  record: PilotRecord | null;
  completion: number;
  missing: string[];
  reload: () => Promise<void>;
  /** Saves a patch and returns an error message, or null on success. */
  save: (patch: Record<string, unknown>) => Promise<string | null>;
  submit: () => Promise<string | null>;
  /** Replaces local state from a response another component produced. */
  apply: (response: api.ProfileResponse) => void;
}

export function useProfile(): ProfileState {
  const [record, setRecord] = useState<PilotRecord | null>(null);
  const [completion, setCompletion] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((response: api.ProfileResponse) => {
    setRecord(response.record);
    setCompletion(response.completion);
    setMissing(response.missing ?? []);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      apply(await api.loadProfile());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your profile.");
    }
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (patch: Record<string, unknown>): Promise<string | null> => {
      setSaving(true);
      try {
        apply(await api.updateProfile(patch));
        setError(null);
        return null;
      } catch (e) {
        const message = e instanceof Error ? e.message : "That did not save.";
        setError(message);
        return message;
      } finally {
        setSaving(false);
      }
    },
    [apply],
  );

  const submit = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    try {
      apply(await api.submitForReview());
      setError(null);
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not submit for review.";
      setError(message);
      return message;
    } finally {
      setSaving(false);
    }
  }, [apply]);

  return { loading, error, saving, record, completion, missing, reload, save, submit, apply };
}
