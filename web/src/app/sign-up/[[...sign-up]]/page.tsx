import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp
        fallbackRedirectUrl="/"
        signInUrl="/sign-in"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
