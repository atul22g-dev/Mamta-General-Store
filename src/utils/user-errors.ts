/**
 * User-safe error mapping for the Find Product flow.
 *
 * CONTRACT: the user NEVER sees raw technical errors (RPC codes, decode
 * internals, HTTP statuses). Every failure kind maps to one friendly
 * sentence plus an action hint. The technical detail is always logged to
 * the console (dev-visible) BEFORE it is replaced — never swallowed.
 *
 * Pure module: mapping logic is unit-testable without Supabase/RN.
 */

/** Every distinct failure the Find Product flow can produce. */
export type SearchFailureKind =
  | 'camera_permission_denied'
  | 'gallery_permission_denied'
  | 'invalid_image'
  | 'optimization_failed'
  | 'read_failed'
  | 'embedding_failed'
  | 'embedding_dimension'
  | 'network'
  | 'supabase'
  | 'rpc'
  | 'timeout'
  | 'no_photo'
  | 'unknown';

/** A failure as the pipeline reports it: kind + technical detail. */
export type SearchFailure = {
  kind: SearchFailureKind;
  /** Technical detail — logged, never shown to the user. */
  technical: string;
  /** Optional HTTP/status/code payload for logs. */
  meta?: Record<string, unknown>;
};

/** User-facing presentation of a failure. */
export type UserError = {
  title: string;
  message: string;
  retryLabel: string;
};

const USER_MESSAGES: Record<SearchFailureKind, UserError> = {
  camera_permission_denied: {
    title: 'Camera unavailable',
    message: 'Allow camera access in Settings to scan products.',
    retryLabel: 'Open Settings',
  },
  gallery_permission_denied: {
    title: 'Photo library unavailable',
    message: 'Allow photo access in Settings to pick a product picture.',
    retryLabel: 'Open Settings',
  },
  invalid_image: {
    title: 'Photo problem',
    message: 'That photo can’t be used. Please take or choose another one.',
    retryLabel: 'Choose another photo',
  },
  optimization_failed: {
    title: 'Photo problem',
    message: 'We couldn’t prepare that photo for search. Please try another one.',
    retryLabel: 'Try another photo',
  },
  read_failed: {
    title: 'Photo problem',
    message: 'The photo is no longer available. Please pick it again.',
    retryLabel: 'Pick again',
  },
  embedding_failed: {
    title: 'Couldn’t complete the match',
    message: 'We couldn’t analyze your photo. Please try again with a clear photo.',
    retryLabel: 'Try again',
  },
  embedding_dimension: {
    title: 'Couldn’t complete the match',
    message: 'Something went wrong analyzing your photo. Please try again.',
    retryLabel: 'Try again',
  },
  network: {
    title: 'No connection',
    message: 'Check your internet connection and try again.',
    retryLabel: 'Try again',
  },
  supabase: {
    title: 'Service unavailable',
    message: 'The store’s search service is briefly unavailable. Try again in a moment.',
    retryLabel: 'Try again',
  },
  rpc: {
    title: 'Search problem',
    message: 'We couldn’t search the catalog right now. Please try again.',
    retryLabel: 'Try again',
  },
  timeout: {
    title: 'Taking too long',
    message: 'The search took too long. Check your connection and try again.',
    retryLabel: 'Try again',
  },
  no_photo: {
    title: 'No photo',
    message: 'Start by taking or choosing a product photo.',
    retryLabel: 'Take a photo',
  },
  unknown: {
    title: 'Couldn’t complete the match',
    message: 'We couldn’t find this product. Please try another clear photo.',
    retryLabel: 'Try again',
  },
};

/** The presentation for a failure kind (falls back to the generic message). */
export function userErrorFor(kind: SearchFailureKind): UserError {
  return USER_MESSAGES[kind] ?? USER_MESSAGES.unknown;
}

/**
 * Converts a failure into what the UI shows: the user-safe message.
 * The technical detail is logged here, once, with the flow tag — so
 * development always has the real cause while production never shows it.
 */
export function presentFailure(failure: SearchFailure): UserError {
  console.error(`[find-product] ${failure.kind}: ${failure.technical}`, failure.meta ?? '');
  return userErrorFor(failure.kind);
}

/**
 * Classifies any thrown/returned error from the pipeline layers into a
 * SearchFailure. Order matters: specific shapes first, network before
 * generic, everything ends at 'unknown' — never a raw message.
 */
export function classifySearchError(error: unknown, context: string): SearchFailure {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';

  const message = raw.toLowerCase();

  // --- Permission denials (from the picker/camera layers) ---
  if (message.includes('camera permission')) {
    return { kind: 'camera_permission_denied', technical: raw, meta: { context } };
  }
  if (message.includes('photo') && message.includes('permission')) {
    return { kind: 'gallery_permission_denied', technical: raw, meta: { context } };
  }

  // --- Timeout / abort (checked before network: AbortError IS a timeout here) ---
  if (message.includes('abort') || message.includes('timed out') || message.includes('timeout')) {
    return { kind: 'timeout', technical: raw, meta: { context } };
  }

  // --- Network connectivity ---
  if (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('offline') ||
    message.includes('internet connection')
  ) {
    return { kind: 'network', technical: raw, meta: { context } };
  }

  // --- Embedding dimension mismatch (contract violation) ---
  if (message.includes('dimension mismatch') || message.includes('dimensions')) {
    return { kind: 'embedding_dimension', technical: raw, meta: { context } };
  }

  // --- Image optimization (app-side) — checked BEFORE embedding keywords,
  // because the optimization service's messages may mention the decoder,
  // while real edge embedding failures always say "Embedding failed" or
  // maxMemoryUsageInMB and match the branch below regardless. ---
  if (message.includes('optimiz') || message.includes('process the image') || message.includes('prepare that photo')) {
    return { kind: 'optimization_failed', technical: raw, meta: { context } };
  }

  // --- Embedding failures (decode, memory, provider) ---
  if (
    message.includes('embedding') ||
    message.includes('maxmemoryusage') ||
    message.includes('decode') ||
    message.includes('descriptor')
  ) {
    return { kind: 'embedding_failed', technical: raw, meta: { context } };
  }
  if (
    message.includes('no longer available') ||
    message.includes('could not read') ||
    message.includes('read the image') ||
    message.includes('file')
  ) {
    return { kind: 'read_failed', technical: raw, meta: { context } };
  }

  // --- Supabase platform errors (PostgREST codes, HTTP statuses) ---
  const code = (error as { code?: string } | null)?.code;
  if (
    (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) ||
    message.includes('pgrst') ||
    message.includes('supabase')
  ) {
    return { kind: 'supabase', technical: raw, meta: { context, code } };
  }

  // --- RPC-specific failures ---
  if (message.includes('rpc') || message.includes('similarity search') || message.includes('visual_search')) {
    return { kind: 'rpc', technical: raw, meta: { context } };
  }

  // --- Invalid image input ---
  if (message.includes('photo is required') || message.includes('not a supported image') || message.includes('unsupported')) {
    return { kind: 'invalid_image', technical: raw, meta: { context } };
  }

  return { kind: 'unknown', technical: raw, meta: { context } };
}
