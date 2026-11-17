/** Select a GitHub review conversation by any of its comment IDs. */
export function selectReviewThread<T extends { id: number; in_reply_to_id?: number | null; created_at?: string | null }>(
  comments: readonly T[], commentId: number,
): T[] {
  const selected = comments.find(comment => comment.id === commentId)
  if (!selected) return []
  const root = selected.in_reply_to_id == null ? selected : comments.find(comment => comment.id === selected.in_reply_to_id)
  if (!root) throw new Error('The root of this review thread is unavailable')
  const replies = comments.filter(comment => comment.in_reply_to_id === root.id)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id - b.id)
  return [root, ...replies]
}
