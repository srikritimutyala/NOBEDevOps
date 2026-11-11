/**
 * src/app/utils/supabase/fetchAll.ts
 *
 * Helper to fetch all rows from a Supabase table by paginating with .range(),
 * bypassing the default 1,000 row limit of Supabase/PostgREST.
 */

export async function fetchAllRows<T = any>(
  supabase: any,
  tableName: string,
  columns: string = "*",
  options?: {
    pageSize?: number;
    modifyQuery?: (query: any) => any;
  }
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 1000;
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(tableName)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (options?.modifyQuery) {
      query = options.modifyQuery(query);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...(data as T[]));

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}
