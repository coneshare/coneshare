import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUpDown, Check } from "lucide-react";
import { Button } from "../../ui/Button";

const getSortOptions = (t) => [
  { value: "name", label: t('analytics.name') },
  { value: "created_by", label: t('analytics.owner') },
  { value: "updated_at", label: t('documents.modified') },
  { value: "file_size", label: t('trash.size') },
];

export function SortButton({ onSort, sortConfig }) {
  const { t } = useTranslation();
  const sortOptions = getSortOptions(t);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4" />
          <span>Sort</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        className="w-48 rounded-md bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800"
      >
        {sortOptions.map((option) => (
          <DropdownMenu.Item
            key={option.value}
            onSelect={() => onSort(option.value)}
            className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <span>{option.label}</span>
            {sortConfig.key === option.value && <Check className="h-4 w-4" />}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
