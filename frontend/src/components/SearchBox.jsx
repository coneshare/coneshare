import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

export function SearchBox({
  value = "",
  onChange,
  onClear,
  loading = false,
  disabled = false,
  placeholder = "Search...",
  className,
  inputClassName,
  ...props
}) {
  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={onChange || (() => {})}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "flex h-10 w-full rounded-md border border-gray-300 bg-white dark:bg-gray-950 px-3 py-2 pl-9 pr-9 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:placeholder:text-gray-400 dark:focus-visible:ring-gray-800",
          inputClassName
        )}
        {...props}
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
        {loading ? (
          <Loader2
            className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500"
            aria-label="Loading"
          />
        ) : value && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
