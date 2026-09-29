import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { wrap } from "@/lib/layout-classes";

export function SiteHeader() {
  return (
    <header
      className={`site-header ${wrap} flex h-[94px] items-center justify-between border-b border-[#dce9e8] max-[670px]:h-[74px] dark:border-[#34505a]`}
    >
      <Link
        className="brand flex items-center gap-[10px] text-[27px] font-extrabold tracking-[-1.9px] text-[#153d49] no-underline max-[670px]:text-2xl dark:text-[#e9f6f4]"
        href="/"
        aria-label="Weather Glint home"
      >
        <span>
          Weather{" "}
          <span className="brand-glint text-[#0a766e] dark:text-[#74e1ce]">
            Glint
          </span>
          <span className="brand-dot text-[#16b6aa]">.</span>
        </span>
      </Link>
      <div className="header-right flex items-center gap-[26px]">
        <span className="header-caption text-[13px] text-[#47656d] max-[670px]:hidden dark:text-[#b0cbd0]">
          A clearer forecast
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
