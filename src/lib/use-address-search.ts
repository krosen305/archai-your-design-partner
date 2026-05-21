// src/lib/use-address-search.ts
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import { searchAddresses } from "./adresse.functions";

export type UseAddressSearchResult = {
  query: string;
  setQuery: (q: string) => void;
  suggestions: GsearchSuggestion[];
  loading: boolean;
  error: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  highlightIdx: number;
  setHighlightIdx: React.Dispatch<React.SetStateAction<number>>;
  showDropdown: boolean;
  markSelected: () => void;
};

export function useAddressSearch(initialQuery = ""): UseAddressSearchResult {
  const [query, setQueryState] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GsearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [hasSelected, setHasSelected] = useState(false);
  const lastQueryRef = useRef<string>("");

  const queryTrimmed = useMemo(() => query.trim(), [query]);
  const showDropdown = open && queryTrimmed.length > 0 && !hasSelected;

  useEffect(() => {
    if (!open || hasSelected) return;
    if (queryTrimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const q = queryTrimmed;
    lastQueryRef.current = q;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await searchAddresses({ data: { q } });
        if (lastQueryRef.current !== q) return;
        setSuggestions(res);
        setHighlightIdx(0);
      } catch {
        if (lastQueryRef.current !== q) return;
        setSuggestions([]);
        setError("Kunne ikke hente adresser. Prøv igen.");
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open, queryTrimmed, hasSelected]);

  function setQuery(q: string) {
    setQueryState(q);
    setHasSelected(false);
  }

  function markSelected() {
    setHasSelected(true);
  }

  return {
    query,
    setQuery,
    suggestions,
    loading,
    error,
    open,
    setOpen,
    highlightIdx,
    setHighlightIdx,
    showDropdown,
    markSelected,
  };
}
