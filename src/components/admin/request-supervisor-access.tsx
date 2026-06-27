"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { data } from "@/lib/data-client";

interface RequestSupervisorAccessButtonProps {
  email: string;
  supervisorRequested: boolean;
  setRequested: (requested: boolean) => void;
}

export function RequestSupervisorAccessButton({ email, supervisorRequested, setRequested }: RequestSupervisorAccessButtonProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const { toast } = useToast();

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await data.access.requestSupervisor({ email });
      toast({
        title: "Request sent!",
        description: "Your request for Supervisor access has been submitted. Please wait for approval.",
      });
      setRequested(true);
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
      disabled={isRequesting || supervisorRequested} 
      variant="secondary"
      className="mt-2"
    >
      {isRequesting 
        ? "Requesting..." 
        : supervisorRequested 
          ? "Supervisor Request Sent" 
          : "Request Supervisor Access"} 
    </Button>
  );
}

