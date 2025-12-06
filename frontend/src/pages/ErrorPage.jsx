// This is a new file
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function ErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center bg-gray-50">
      <h1 className="text-4xl font-bold">500 - Something went wrong</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        We're sorry, but the server encountered an internal error.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Go to Home</Link>
      </Button>
    </div>
  );
}
