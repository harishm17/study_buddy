/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
  // Old URLs from before the course rebuild. `/exams/:examId` is not here: it needs the
  // course id, so src/app/exams/[examId] looks it up and redirects.
  async redirects() {
    const course = (source, destination, extra = {}) => ({
      source,
      destination,
      permanent: true,
      ...extra,
    })
    const tab = (value, path) =>
      course('/projects/:id', `/courses/:id/${path}`, {
        has: [{ type: 'query', key: 'tab', value }],
      })
    return [
      course('/dashboard', '/home'),
      // Specific old pages first, then the generic prefix rule.
      tab('materials', 'materials'),
      tab('topics', 'topics'),
      tab('exams', 'exams'),
      tab('ask', 'ask'),
      course('/projects/:id/topics/review', '/courses/:id/topics?edit=1'),
      course('/projects/:id/upload', '/courses/:id/materials'),
      course('/projects/:id/generate-exam', '/courses/:id/exams/new'),
      course('/projects/:id/voice-sprint', '/courses/:id/review'),
      course('/projects/:id', '/courses/:id'),
      course('/projects/:id/:rest*', '/courses/:id/:rest*'),
    ]
  },
}

module.exports = nextConfig
