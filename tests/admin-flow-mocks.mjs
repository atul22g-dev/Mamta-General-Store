/**
 * Stateful Supabase mock for the admin lifecycle test — a tiny database,
 * not a stub: rows live in Maps, queries chain and execute on await, so
 * the REAL services run against believable data.
 */
import { randomUUID } from 'node:crypto';

export const VALID_512 = Array.from({ length: 512 }, () => 0.05);

let state = null;

export function __setAdminFlowState(next) {
  state = next;
}

export function __getAdminFlowState() {
  return state;
}

function rowsOf(table) {
  if (table === 'products') return state.rows;
  if (table === 'product_images') return state.images;
  throw new Error(`mock: unknown table ${table}`);
}

function makeBuilder(table) {
  const ops = [];
  let selectCols = null;
  let single = false;
  let insertValues = null;
  let updateValues = null;
  let wantDelete = false;

  const builder = {
    select(cols) {
      selectCols = cols ?? '*';
      return this;
    },
    insert(values) {
      insertValues = values;
      return this;
    },
    update(values) {
      updateValues = values;
      return this;
    },
    delete() {
      wantDelete = true;
      return this;
    },
    eq(col, val) {
      ops.push({ type: 'eq', col, val });
      return this;
    },
    in(col, vals) {
      ops.push({ type: 'in', col, vals });
      return this;
    },
    ilike(col, pattern) {
      ops.push({ type: 'ilike', col, pattern });
      return this;
    },
    order(col, opts) {
      ops.push({ type: 'order', col, opts });
      return this;
    },
    limit(n) {
      ops.push({ type: 'limit', n });
      return this;
    },
    is(col, value) {
      ops.push({ type: 'is', col, value });
      return this;
    },
    single() {
      single = true;
      return this;
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
  };

  function matches(row) {
    return ops.every((op) => {
      if (op.type === 'eq') return row[op.col] === op.val;
      if (op.type === 'in') return op.vals.includes(row[op.col]);
      if (op.type === 'is') return row[op.col] === op.val;
      if (op.type === 'ilike') {
        const pattern = op.pattern.replaceAll('%', '');
        return String(row[op.col] ?? '').toLowerCase().includes(pattern.toLowerCase());
      }
      return true;
    });
  }

  async function execute() {
    const map = rowsOf(table);

    if (wantDelete) {
      let deleted = 0;
      for (const [key, row] of [...map]) {
        if (matches(row)) {
          map.delete(key);
          deleted += 1;
        }
      }
      // product_images cascade on products delete.
      if (table === 'products') {
        for (const [key, image] of [...state.images]) {
          if (!state.rows.has(image.product_id)) state.images.delete(key);
        }
      }
      return { data: null, error: null };
    }

    if (updateValues) {
      for (const [key, row] of map) {
        if (matches(row)) map.set(key, { ...row, ...updateValues });
      }
      return { data: null, error: null };
    }

    if (insertValues) {
      const values = Array.isArray(insertValues) ? insertValues : [insertValues];
      const inserted = values.map((value) => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        ...value,
      }));
      for (const row of inserted) map.set(row.id, row);
      state.counters.creates += table === 'products' ? inserted.length : 0;
      if (selectCols) {
        return { data: single ? inserted[0] : inserted, error: null };
      }
      return { data: null, error: null };
    }

    // READ
    let rows = [...map.values()].filter(matches);
    for (const op of ops) {
      if (op.type === 'order') {
        const col = op.col === 'created_at' && !rows[0]?.created_at ? 'id' : op.col;
        rows = [...rows].sort((a, b) =>
          op.opts?.ascending === false
            ? String(b[col]).localeCompare(String(a[col]))
            : String(a[col]).localeCompare(String(b[col])),
        );
      }
      if (op.type === 'limit') rows = rows.slice(0, op.n);
    }

    if (selectCols && selectCols.includes('product_images(')) {
      rows = rows.map((row) => ({
        ...row,
        product_images: [...state.images.values()]
          .filter((image) => image.product_id === row.id)
          .map(({ id, image_url }) => ({ id, image_url })),
      }));
    }

    if (single) {
      return rows.length > 0
        ? { data: rows[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    return { data: rows, error: null };
  }

  return builder;
}

export const supabase = {
  from: (table) => makeBuilder(table),

  storage: {
    from(_bucket) {
      return {
        async upload(objectPath) {
          if (state.uploadError) return { error: state.uploadError };
          state.storage.set(objectPath, true);
          state.counters.uploads += 1;
          return { error: null };
        },
        getPublicUrl(objectPath) {
          return {
            data: { publicUrl: `https://mock.storage/product-images/${objectPath}` },
          };
        },
        async remove(paths) {
          if (state.storageRemoveError) return { error: state.storageRemoveError };
          for (const objectPath of paths) state.storage.delete(objectPath);
          state.counters.storageRemoves += paths.length;
          return { error: null };
        },
      };
    },
  },

  functions: {
    async invoke(_name, { body } = {}) {
      if (state.invokeError) return { data: null, error: state.invokeError };
      state.counters.embeds += 1;
      state.lastEmbedProductId = body?.product_id ?? null;

      let embedded = 0;
      if (body?.product_id) {
        for (const image of state.images.values()) {
          // Pending = missing or null — matches the real edge function's
          // `embedding is null` semantics.
          if (image.product_id === body.product_id && !image.embedding) {
            image.embedding = [...VALID_512];
            embedded += 1;
          }
        }
      }
      return { data: { embedded, failed: [] }, error: null };
    },
  },

  async rpc(name, args) {
    if (name !== 'visual_search_matches') {
      return { data: null, error: { message: `mock: unknown rpc ${name}` } };
    }
    state.lastRpc = { name, args };
    if (state.rpcError) return { data: null, error: state.rpcError };
    return { data: state.rpcResult, error: null };
  },
};
