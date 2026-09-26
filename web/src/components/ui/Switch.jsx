import * as React from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import cn from "./cn";

const Switch = ({ className, ...props }) => (
  <RadixSwitch.Root
    className={cn(
      "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-border-strong transition-colors",
      "data-[state=checked]:bg-accent disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
  </RadixSwitch.Root>
);

export default Switch;
