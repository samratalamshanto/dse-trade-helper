import { ImageResponse } from 'next/og';

const SIZES = [192, 512];
const BARS = [0.42, 0.62, 0.86];

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), contentType: 'image/png', size: { width: s, height: s } }));
}

// A rising bar chart drawn with plain shapes, so the icon needs no font files.
export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id) || SIZES[0];
  const unit = size / 16;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: unit,
        padding: unit * 3, background: '#1f57c3', borderRadius: unit * 3 }}>
        {BARS.map((h, i) => (
          <div key={i} style={{ width: unit * 2.4, height: `${h * 100}%`, background: i === BARS.length - 1 ? '#2fc483' : '#ffffff', borderRadius: unit * 0.6 }} />
        ))}
      </div>
    ),
    { width: size, height: size },
  );
}
