/** Pagination helpers */

export interface PaginationParams {
  limit: number
  offset: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/** Parse pagination from query params */
export function parsePagination(query: { limit?: string; offset?: string }): PaginationParams {
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20))
  const offset = Math.max(0, parseInt(query.offset ?? '0', 10) || 0)
  return { limit, offset }
}

/** Wrap results in paginated response */
export function paginate<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  return {
    data,
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + params.limit < total,
  }
}
