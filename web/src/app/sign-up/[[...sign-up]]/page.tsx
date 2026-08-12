import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#f8fbf7_0%,#eef4ef_48%,#f0ebe0_100%)] p-6">
      <SignUp
        fallbackRedirectUrl="/app"
        signInUrl="/sign-in"
        appearance={{
          variables: {
            colorPrimary: "#1f4a36",
          },
        }}
      />
    </main>
  );
}
