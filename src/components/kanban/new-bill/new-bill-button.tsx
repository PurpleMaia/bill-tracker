import { ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { NewBillDialog } from "./new-bill-dialog";

export default function NewBillButton() {
    const [ isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
    return (
        <>
        <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
           <ListTodo />Manage Bills
        </Button>

        <NewBillDialog
            isOpen={isDialogOpen}
            onClose={() => {
                setIsDialogOpen(false)
            }}
        />
        </>
    )
}