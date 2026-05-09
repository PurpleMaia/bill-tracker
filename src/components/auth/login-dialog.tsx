'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { LogIn } from 'lucide-react';

export function LoginDialog() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {

      //calls login from auth context
      const result = await login(identifier, password);

      if (result && result.success) {
        //shows success message
        toast({
          title: 'Success!',
          description: 'You are now logged in.',
        });

        //closes dialog and clears form
        setIsOpen(false);
        setIdentifier('');
        setPassword('');
      } else if (result && result.error) {
        //shows error message from context
        toast({
          title: 'Login Failed',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        //generic error message
        toast({
          title: 'Login Failed',
          description: 'An unknown error occurred.',
          variant: 'destructive',
        });        
      } 
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 shadow-sm text-primary bg-white">
          <LogIn className="mr-1" />
          Login
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email/Username</Label>
            <Input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter your email or username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account? Please sign up <Link href="/register" className='text-blue-500 hover:underline'>here</Link>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}