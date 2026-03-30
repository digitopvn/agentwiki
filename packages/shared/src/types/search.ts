/** Shared search type definitions */

export interface SearchResult {
  id: string
  title: string
  slug: string
  snippet?: string
  score?: number
  category?: string
  accuracy?: number // 0-100 relevance percentage
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
  type: string
  searchId?: string // for click tracking
}

export interface SuggestItem {
  text: string
  source: 'title' | 'history' | 'fuzzy'
  documentId?: string
  slug?: string
  accuracy?: number // 0-100 relevance percentage
}

export interface SuggestResponse {
  suggestions: SuggestItem[]
  query: string
}

export interface SearchFilters {
  tags?: string[]
  category?: string
  dateFrom?: string
  dateTo?: string
}

export interface FacetBucket {
  name: string
  count: number
}

export interface SearchFacets {
  categories: FacetBucket[]
  tags: FacetBucket[]
  dateRanges: {
    thisWeek: number
    thisMonth: number
    thisQuarter: number
    older: number
  }
}

export interface SearchClickEvent {
  searchId: string
  documentId: string
  position: number
}

/** Image search result with enriched upload metadata */
export interface ImageSearchResult {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  description: string | null
  summary: string | null
  snippet: string
  score?: number
  accuracy?: number
  fileUrl: string
  documentId: string | null
  createdAt: string
}

/** Filters for image-specific search */
export interface ImageSearchFilters {
  documentId?: string
  contentTypes?: string[]
  dateFrom?: string
  dateTo?: string
}

export interface AnalyticsSummary {
  topQueries: { query: string; count: number; avgResults: number }[]
  zeroResultQueries: { query: string; count: number; lastSearched: string }[]
  clickThroughRate: number
  searchTypeDistribution: { type: string; count: number }[]
  totalSearches: number
  period: '7d' | '30d'
}
