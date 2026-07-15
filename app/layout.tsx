import type { Metadata } from "next";
import "./globals.css";

const title = "서코 334 부스맵";
const description = "코믹월드 334회 참가 부스를 날짜와 장르로 탐색하는 인터랙티브 지도";
const siteUrl = "https://yuyeoreum.github.io/bluearchivechan/";
const imageUrl = `${siteUrl}og.png`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl },
  openGraph: { title, description, type: "website", url: siteUrl, images: [{ url: imageUrl, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
