"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { data } from "@/lib/data-client";

interface RequestAdminAccessButtonProps {
  email: string;
  adminRequested: boolean; // callback to parent state
  setRequested?: (requested: boolean) => void; // Optional callback to update parent state
}

export function RequestAdminAccessButton({ email, adminRequested, setRequested }: RequestAdminAccessButtonProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const { toast } = useToast();

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await data.access.requestAdmin({ email });
      toast({
        title: "Request sent!",
        description: "Your request for Admin access has been submitted. Please wait for approval.",
      });
      setRequested?.(true);
    } catch (e) {
      toast({
        title: "Request failed",
        description: "Could not send your request. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Button 
      onClick={handleRequest} 
      disabled={isRequesting || adminRequested} 
      variant="secondary"
    >
      {isRequesting 
        ? "Requesting..." 
        : adminRequested 
          ? "Admin Request Sent" 
          : "Request Admin Access"} 
    </Button>
  );
}
