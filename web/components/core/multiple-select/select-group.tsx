import { useMemo } from "react";
// hooks
import { TEntityDetails, TSelectionHelper, TSelectionSnapshot, useMultipleSelect } from "@/hooks/use-multiple-select";

type Props = {
  children: (helpers: TSelectionHelper, snapshot: TSelectionSnapshot) => React.ReactNode;
  groups: string[];
  entities: Record<string, string[]>; // { groupID: entityIds[] }
};

export const MultipleSelectGroup: React.FC<Props> = (props) => {
  const { children, entities, groups } = props;

  const entityDetails: TEntityDetails[] = useMemo(
    () =>
      groups
        .map((groupID) =>
          entities[groupID].map((entityID) => ({
            entityID,
            groupID,
          }))
        )
        .flat(1),
    [entities, groups]
  );

  console.log("entityDetails", entityDetails);

  const { helpers, snapshot } = useMultipleSelect({
    entities: entityDetails,
    groups,
  });

  return <>{children(helpers, snapshot)}</>;
};