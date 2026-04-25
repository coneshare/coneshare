import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
  options: {
    remarkPlugins: ['remark-gfm'],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  pageExtensions: ['js', 'jsx', 'md', 'mdx'],
};

export default withMDX(nextConfig);
