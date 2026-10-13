import { CustomSelect } from './CustomSelect';

const sessionTimes = [5, 10, 20, 30];

export function SessionTimeSelect({
  id,
  minutes,
  onValueChange,
}: {
  id: string;
  minutes: number;
  onValueChange: (minutes: number) => void;
}) {
  return (
    <CustomSelect
      id={id}
      value={String(minutes)}
      options={[...new Set([...sessionTimes, minutes])]
        .sort((left, right) => left - right)
        .map((time) => ({
          value: String(time),
          label: `About ${time} minutes`,
        }))}
      onValueChange={(value) => onValueChange(Number(value))}
    />
  );
}
