import React from 'react';
import { getClassNameFromMs, msToText } from '../helpers/util';

export default function DiffToLap({
  title,
  diff,
  lapTime,
  sectorDiff,
}: {
  title: string;
  diff: number | undefined;
  lapTime: number | undefined;
  sectorDiff: number[] | undefined;
}) {
  return (
    <div className="border-y border-solid border-y-blue-800">
      <div>
        <span className="text-gray-400">
          {title} ({lapTime == null ? '' : msToText(lapTime)})
        </span>
      </div>
      {diff != null && (
        <div className={`text-3xl ${getClassNameFromMs(diff)}`}>
          {msToText(diff)}
        </div>
      )}
      {sectorDiff != null && (
        <div>
          <div className="flex flex-row justify-between text-center">
            <div className={`flex-grow ${getClassNameFromMs(sectorDiff[0])}`}>
              {msToText(sectorDiff[0])},{' '}
            </div>
            <div className={`flex-grow ${getClassNameFromMs(sectorDiff[1])}`}>
              {msToText(sectorDiff[1])},{' '}
            </div>
            <div className={`flex-grow ${getClassNameFromMs(sectorDiff[2])}`}>
              {msToText(sectorDiff[2])}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
