import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn
        fallbackRedirectUrl="/app"
        signUpUrl="/sign-up"
        appearance={clerkAppearance}
      />
    </AuthShell>
  );
}
