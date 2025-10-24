import * as React from 'react';
import * as PasswordToggleField from '@radix-ui/react-password-toggle-field';
import { EyeClosedIcon, EyeOpenIcon } from '@radix-ui/react-icons';
import { cn } from '../../lib/utils';

const PasswordInput = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <PasswordToggleField.Root>
      <div className="relative">
        <PasswordToggleField.Input
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        <PasswordToggleField.Toggle className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-muted-foreground hover:text-foreground">
          <PasswordToggleField.Icon
            visible={<EyeOpenIcon className="h-4 w-4" />}
            hidden={<EyeClosedIcon className="h-4 w-4" />}
          />
        </PasswordToggleField.Toggle>
      </div>
    </PasswordToggleField.Root>
  );
});
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
