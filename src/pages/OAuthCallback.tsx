import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CallbackState = "processing" | "success" | "error";

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>("processing");
  const [error, setError] = useState<string | null>(null);
  const [integrationName, setIntegrationName] = useState<string | null>(null);

  const handleCallback = trpc.oauth.handleCallback.useMutation({
    onSuccess: (data) => {
      setState("success");
      setIntegrationName(data.integrationName);
      // Redirect to integrations page after a short delay
      setTimeout(() => {
        navigate("/app/integrations");
      }, 2000);
    },
    onError: (err) => {
      setState("error");
      setError(err.message);
    },
  });

  useEffect(() => {
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");

    if (!code || !stateParam) {
      setState("error");
      setError("Missing authorization code or state parameter");
      return;
    }

    // Get the redirect URI (current URL without query params)
    const redirectUri = `${window.location.origin}${window.location.pathname}`;

    // Exchange the code for tokens
    handleCallback.mutate({
      code,
      state: stateParam,
      redirectUri,
    });
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {state === "processing" && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>Connecting...</CardTitle>
              <CardDescription>
                Please wait while we complete the authorization
              </CardDescription>
            </>
          )}

          {state === "success" && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Connected!</CardTitle>
              <CardDescription>
                {integrationName} has been successfully connected to your account
              </CardDescription>
            </>
          )}

          {state === "error" && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle>Connection Failed</CardTitle>
              <CardDescription>
                {error || "An error occurred during authorization"}
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="flex justify-center">
          {state === "success" && (
            <p className="text-sm text-muted-foreground">
              Redirecting to integrations...
            </p>
          )}

          {state === "error" && (
            <Button onClick={() => navigate("/app/integrations")}>
              Back to Integrations
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
