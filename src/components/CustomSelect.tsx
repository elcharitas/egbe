import { useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { tabbable } from 'tabbable';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@primer/octicons-react';

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function CustomSelect({
  id,
  value,
  options,
  disabled,
  onValueChange,
}: {
  id: string;
  value: string;
  options: readonly SelectOption[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabDirection = useRef<number | null>(null);

  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      open={open}
      onOpenChange={setOpen}
    >
      <Select.Trigger ref={trigger} id={id} className="custom-select-trigger">
        <Select.Value className="custom-select-value">
          {options.find((option) => option.value === value)?.label}
        </Select.Value>
        <Select.Icon className="custom-select-icon">
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="custom-select-content"
          position="popper"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            tabDirection.current = event.shiftKey ? -1 : 1;
            setOpen(false);
          }}
          onCloseAutoFocus={(event) => {
            const direction = tabDirection.current;
            tabDirection.current = null;
            if (direction === null || !trigger.current) return;
            event.preventDefault();
            const controls = tabbable(document.body).filter(
              (element) => !element.hasAttribute('data-radix-focus-guard'),
            );
            const next =
              controls[controls.indexOf(trigger.current) + direction];
            (next ?? trigger.current).focus();
          }}
        >
          <Select.ScrollUpButton className="custom-select-scroll">
            <ChevronUpIcon />
          </Select.ScrollUpButton>
          <Select.Viewport className="custom-select-viewport">
            {options.map((option) => (
              <Select.Item
                className="custom-select-option"
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                textValue={option.label}
              >
                <Select.ItemIndicator className="custom-select-check">
                  <CheckIcon />
                </Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="custom-select-scroll">
            <ChevronDownIcon />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
