'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

interface AvailableUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

interface MyAdoptee {
  id: string;
  email: string;
  username: string;
  adopted_at: string;
}

export function SupervisorDashboard() {
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [myAdoptees, setMyAdoptees] = useState<MyAdoptee[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingAdoptees, setIsLoadingAdoptees] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAvailableUsers();
    fetchMyAdoptees();
  }, []);

  const fetchAvailableUsers = async () => {
    try {
      const response = await fetch('/api/supervisors?available=true');
      if (!response.ok) {
        throw new Error('Failed to fetch available users');
      }
      const data = await response.json();
      if (data.success && data.users) {
        setAvailableUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching available users:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch available users',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchMyAdoptees = async () => {
    try {
      const response = await fetch('/api/supervisors');
      if (!response.ok) {
        throw new Error('Failed to fetch my adoptees');
      }
      const data = await response.json();
      if (data.success && data.adoptees) {
        setMyAdoptees(data.adoptees);
      }
    } catch (error) {
      console.error('Error fetching my adoptees:', error);
    } finally {
      setIsLoadingAdoptees(false);
    }
  };

  const handleAdoptUser = async (userId: string, username: string) => {
    try {
      const response = await fetch('/api/supervisors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to adopt user');
      }

      toast({
        title: 'Success',
        description: `Successfully adopted ${username}`,
      });

      // Refresh both lists
      fetchAvailableUsers();
      fetchMyAdoptees();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to adopt user',
        variant: 'destructive',
      });
    }
  };

  const handleDropUser = async (userId: string, username: string) => {
    try {
      const response = await fetch('/api/supervisors', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to drop user');
      }

      toast({
        title: 'Success',
        description: `Successfully dropped ${username}`,
      });

      // Refresh both lists
      fetchAvailableUsers();
      fetchMyAdoptees();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to drop user',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      
      {/* My Adopted Interns */}
      <div>
        <h1 className="text-2xl font-bold mb-6">My Adopted Interns</h1>
        {isLoadingAdoptees ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : (
            <div className="space-y-4">
              {myAdoptees.length === 0 ? (
                <Card className="p-6">
                  <p className="text-center text-muted-foreground">
                    No adopted interns yet
                  </p>
                </Card>
              ) : (
                myAdoptees.map((adoptee) => (
                  <Card key={adoptee.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <h3 className="font-semibold">{adoptee.username}</h3>
                        <p className="text-sm text-muted-foreground">{adoptee.email}</p>
                        <Badge variant="outline">
                          Adopted: {new Date(adoptee.adopted_at).toLocaleDateString()}
                        </Badge>
                      </div>
                      <Button
                        onClick={() => handleDropUser(adoptee.id, adoptee.username)}
                        variant="destructive"
                      >
                        Drop
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
        )}
      </div>

      {/* Available Users to Adopt */}
      <div>


        <h1 className="text-2xl font-bold mb-6">Available Users to Adopt</h1>
        {isLoadingUsers ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : (
            <div className="space-y-4">
              {availableUsers.length === 0 ? (
                <Card className="p-6">
                  <p className="text-center text-muted-foreground">
                    No available users to adopt
                  </p>
                </Card>
              ) : (
                availableUsers.map((user) => (
                  <Card key={user.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <h3 className="font-semibold">{user.username}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <Button
                        onClick={() => handleAdoptUser(user.id, user.username)}
                        variant="default"
                      >
                        Adopt
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
        )}
      </div>
    </div>
  );
}

