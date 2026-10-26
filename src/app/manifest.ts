import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ashik's Home 3D",
    short_name: "Ashik's Home",
    description: 'Walk through the house in realistic 3D',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#0d1117',
    theme_color: '#0d1117',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
