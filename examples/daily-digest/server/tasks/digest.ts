export default defineTask({
  meta: {
    name: 'digest',
    description: 'Write the daily digest',
  },
  async run() {
    return { result: await writeDigest() }
  },
})
