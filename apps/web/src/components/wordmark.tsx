import Image from "next/image";

/** The Project23 logo (transparent PNG); height drives size, width follows its 897×326 ratio. */
export function Wordmark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/project23-logo.png"
      alt="Project23"
      width={897}
      height={326}
      priority={priority}
      className={`h-9 w-auto ${className ?? ""}`}
    />
  );
}
