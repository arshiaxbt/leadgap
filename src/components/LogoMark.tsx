import Image from "next/image";
import { APP_LOGO_RASTER } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function LogoMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <Image
      src={APP_LOGO_RASTER}
      alt=""
      width={512}
      height={512}
      className={cn("rounded-[5px] object-cover", className)}
      aria-hidden
    />
  );
}

export { LogoMark as GapMark };
