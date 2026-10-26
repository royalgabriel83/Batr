"use client";

import { useActionState } from "react";
import { AUTH_MESSAGES } from "@batr/shared";
import { formText, type FormMessage } from "./state";

type ActionState = { message?: FormMessage; values?: Record<string, string> };

/**
 * useActionState for a server action, plus the network-error state:
 * if the request never reaches the server, the form keeps what was
 * typed and shows the network message instead of an error page.
 */
export function useFormAction<State extends ActionState>(
  action: (state: State, data: FormData) => Promise<State>,
  initial: Awaited<State>,
) {
  return useActionState<State, FormData>(async (state, data) => {
    try {
      return await action(state, data);
    } catch (error) {
      // A failed fetch is a TypeError. Anything else (including the
      // framework's redirect signal) is not ours to handle.
      if (!(error instanceof TypeError)) throw error;
      const values = state.values
        ? Object.fromEntries(Object.keys(state.values).map((name) => [name, formText(data, name)]))
        : undefined;
      return { ...state, ...(values ? { values } : {}), message: { tone: "danger", text: AUTH_MESSAGES.network } };
    }
  }, initial);
}
