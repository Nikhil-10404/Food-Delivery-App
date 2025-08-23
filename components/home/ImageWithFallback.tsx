import React, { useEffect, useState } from "react";
import { Image } from "expo-image";

/** Convert Appwrite /view to /download as a safe fallback */
function toDownloadUrl(input: string) {
  try {
    const u = new URL(input);
    const parts = u.pathname.split("/").filter(Boolean);
    const bIdx = parts.indexOf("buckets");
    const fIdx = parts.indexOf("files");
    const bucketId = parts[bIdx + 1];
    const fileId = parts[fIdx + 1];
    const project = u.searchParams.get("project") || "";
    return `${u.origin}/v1/storage/buckets/${bucketId}/files/${fileId}/download?project=${project}`;
  } catch {
    return input;
  }
}

export default function ImageWithFallback({
  src,
  alt,
  width = 112,
  height = 96,
  radius = 18,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  radius?: number;
}) {
  const [uri, setUri] = useState(src);
  const [triedDownload, setTriedDownload] = useState(false);

  useEffect(() => {
    setUri(src);
    setTriedDownload(false);
  }, [src]);

  return (
    <Image
      source={{ uri }}
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: "#F1F3F6",
      }}
      contentFit="cover"
      transition={160}
      cachePolicy="memory-disk"
      onError={() => {
        if (!triedDownload) {
          setTriedDownload(true);
          setUri(toDownloadUrl(src));
        }
      }}
      accessibilityLabel={alt}
    />
  );
}
