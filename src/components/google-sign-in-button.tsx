import Image from "next/image";

export function GoogleSignInButton() {
  return (
    <a
      href="/api/auth/google"
      className="mt-4 flex min-h-10 w-full items-center justify-center gap-3 rounded-md border border-[#747775] bg-white px-3 font-sans text-sm font-medium text-[#1f1f1f] hover:bg-[#f8faff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#252526]"
    >
      <Image src="/google-logo.png" alt="" width={200} height={204} sizes="20px" className="h-auto w-5" />
      Continue with Google
    </a>
  );
}
