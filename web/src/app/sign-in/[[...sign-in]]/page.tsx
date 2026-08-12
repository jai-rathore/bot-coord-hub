import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#f8fbf7_0%,#eef4ef_48%,#f0ebe0_100%)] p-6">
      <SignIn
        fallbackRedirectUrl="/app"
        signUpUrl="/sign-up"
        appearance={{
          variables: {
            colorPrimary: "#1f4a36",
          },
        }}
      />
    </main>
  );
}
