export default defineEventHandler(() =>
  issues.map(({ number, title, author, labels }) => ({
    number,
    title,
    author,
    labels,
  })),
)
