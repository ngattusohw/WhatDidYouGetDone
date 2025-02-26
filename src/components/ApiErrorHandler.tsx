import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Link } from 'react-router-dom';

interface ErrorAction {
  label: string;
  href: string;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
}

interface ApiErrorHandlerProps {
  error: Error | string;
  title?: string;
  description?: string;
  action?: ErrorAction;
}

export default function ApiErrorHandler({
  error,
  title = 'Error',
  description,
  action,
}: ApiErrorHandlerProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  // Handle specific error types
  if (errorMessage.includes('Bad credentials')) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>GitHub Authentication Error</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-4">
            Your GitHub credentials have expired or are invalid. Please update
            your GitHub token to continue accessing your stats.
          </p>
          <Button variant="outline" asChild>
            <Link to="/app/settings">Update GitHub Token</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Generic error handler for other types of errors
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-4">{description || errorMessage}</p>
        {action && (
          <Button variant={action.variant || 'outline'} asChild>
            <Link to={action.href}>{action.label}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
