import React from 'react'
import { TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge';

interface AdminHeaderProps {
  count: {
    accounts: number;
    allInterns: number;
    allSupervisors: number;
    allTrackedBills: number;
  }
}
export default function AdminHeader({ count }: AdminHeaderProps) {
  const activeStyle = 'data-[state=active]:bg-accent data-[state=active]:text-white'
  return (
    <div className='px-6 py-2 border-b bg-white flex items-center justify-between shadow-md'>
        <div className=''>
            <TabsList className="space-x-4 shadow-sm border">
                <TabsTrigger value="pending-requests" className={activeStyle}>
                  Accounts <Badge className='ml-1 bg-red-100 text-red-800'>{count.accounts}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all-tracked-bills" className={activeStyle}>
                  Tracked Bills <Badge className='ml-1 bg-yellow-100 text-yellow-800'>{count.allTrackedBills}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all-interns" className={activeStyle}>
                  Users <Badge className='ml-1 bg-blue-100 text-blue-800'>{count.allInterns}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all-supervisors" className={activeStyle}>
                  Supervisors <Badge className='ml-1 bg-green-100 text-green-800'>{count.allSupervisors}</Badge>
                </TabsTrigger>
            </TabsList>
        </div>

        {/* <div className='space-x-2 mr-4 py-2'>
            <Button>New Request</Button>
            <Button>New Request</Button>
            <Button>New Request</Button>
        </div> */}
    </div>
  )
}
