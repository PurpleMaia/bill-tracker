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
  // Phones: the three tabs split the row evenly (grid) with tighter padding and
  // badges, so nothing scrolls sideways; sm+ keeps the content-width row.
  const tabStyle =
    'min-w-0 gap-1 px-1.5 text-xs sm:gap-0 sm:px-3 sm:text-sm data-[state=active]:bg-accent data-[state=active]:text-white'
  const badgeStyle = 'px-1.5 py-0 text-xs sm:ml-1 sm:px-2.5 sm:py-0.5'
  return (
    <div className='px-3 sm:px-6 py-2 border-b bg-white flex items-center justify-between shadow-md'>
        <div className='w-full'>
            <TabsList className="grid w-full grid-cols-3 gap-1 shadow-sm border sm:flex sm:w-max sm:gap-0 sm:space-x-4">
                <TabsTrigger value="pending-requests" className={tabStyle}>
                  Accounts <Badge className={`${badgeStyle} bg-red-100 text-red-800`}>{count.accounts}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all-tracked-bills" className={tabStyle}>
                  {/* "Tracked" is what won't fit a third of a phone row. */}
                  <span><span className="hidden sm:inline">Tracked </span>Bills</span>
                  <Badge className={`${badgeStyle} bg-yellow-100 text-yellow-800`}>{count.allTrackedBills}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all-interns" className={tabStyle}>
                  Users <Badge className={`${badgeStyle} bg-blue-100 text-blue-800`}>{count.allInterns}</Badge>
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
