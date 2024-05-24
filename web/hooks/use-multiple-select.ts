import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
// hooks
import { useMultipleSelectStore } from "@/hooks/store";

export type TEntityDetails = {
  entityID: string;
  groupID: string;
};

type Props = {
  containerRef: React.MutableRefObject<HTMLElement | null>;
  entities: Record<string, string[]>; // { groupID: entityIds[] }
};

export type TSelectionSnapshot = {
  isSelectionActive: boolean;
  selectedEntityIds: string[];
};

export type TSelectionHelper = {
  handleClearSelection: () => void;
  handleEntityClick: (event: React.MouseEvent, entityID: string, groupId: string) => void;
  isEntitySelected: (entityID: string) => boolean;
  isEntityActive: (entityID: string) => boolean;
  handleGroupClick: (groupID: string) => void;
  isGroupSelected: (groupID: string) => "empty" | "partial" | "complete";
};

export const useMultipleSelect = (props: Props) => {
  const { containerRef, entities } = props;
  // router
  const router = useRouter();
  // store hooks
  const {
    selectedEntityDetails,
    updateSelectedEntityDetails,
    activeEntityDetails,
    updateActiveEntityDetails,
    previousActiveEntity,
    updatePreviousActiveEntity,
    nextActiveEntity,
    updateNextActiveEntity,
    lastSelectedEntityDetails,
    clearSelection,
    isEntitySelected,
    isEntityActive,
  } = useMultipleSelectStore();

  const groups = useMemo(() => Object.keys(entities), [entities]);

  const entitiesList: TEntityDetails[] = useMemo(
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

  const getPreviousAndNextEntities = useCallback(
    (entityID: string) => {
      const currentEntityIndex = entitiesList.findIndex((entity) => entity?.entityID === entityID);

      // entity position
      const isFirstEntity = currentEntityIndex === 0;
      const isLastEntity = currentEntityIndex === entitiesList.length - 1;

      let previousEntity: TEntityDetails | null = null;
      let nextEntity: TEntityDetails | null = null;

      if (isLastEntity) {
        nextEntity = null;
      } else {
        nextEntity = entitiesList[currentEntityIndex + 1];
      }

      if (isFirstEntity) {
        previousEntity = null;
      } else {
        previousEntity = entitiesList[currentEntityIndex - 1];
      }

      return {
        previousEntity,
        nextEntity,
      };
    },
    [entitiesList]
  );

  const handleActiveEntityChange = useCallback(
    (entityDetails: TEntityDetails | null, shouldScroll: boolean = true) => {
      if (!entityDetails) {
        updateActiveEntityDetails(null);
        updatePreviousActiveEntity(null);
        updateNextActiveEntity(null);
        return;
      }

      updateActiveEntityDetails(entityDetails);

      // scroll to get the active element in view
      const activeElement = document.querySelector(
        `[data-entity-id="${entityDetails.entityID}"][data-entity-group-id="${entityDetails.groupID}"]`
      );
      if (activeElement && containerRef.current && shouldScroll) {
        const SCROLL_OFFSET = 200;
        const containerRect = containerRef.current.getBoundingClientRect();
        const elementRect = activeElement.getBoundingClientRect();

        const isInView =
          elementRect.top >= containerRect.top + SCROLL_OFFSET &&
          elementRect.bottom <= containerRect.bottom - SCROLL_OFFSET;

        if (!isInView) {
          containerRef.current.scrollBy({
            top: elementRect.top < containerRect.top + SCROLL_OFFSET ? -50 : 50,
          });
        }
      }

      const { previousEntity: previousActiveEntity, nextEntity: nextActiveEntity } = getPreviousAndNextEntities(
        entityDetails.entityID
      );
      updatePreviousActiveEntity(previousActiveEntity);
      updateNextActiveEntity(nextActiveEntity);
    },
    [
      containerRef,
      getPreviousAndNextEntities,
      updateActiveEntityDetails,
      updateNextActiveEntity,
      updatePreviousActiveEntity,
    ]
  );

  const handleEntitySelection = useCallback(
    (
      entityDetails: TEntityDetails,
      shouldScroll: boolean = true,
      forceAction: "force-add" | "force-remove" | null = null
    ) => {
      const isSelected = isEntitySelected(entityDetails.entityID);

      if (forceAction) {
        if (forceAction === "force-add") {
          updateSelectedEntityDetails(entityDetails, "add");
          handleActiveEntityChange(entityDetails, shouldScroll);
        }
        if (forceAction === "force-remove") {
          updateSelectedEntityDetails(entityDetails, "remove");
        }
        return;
      }

      if (isSelected) {
        updateSelectedEntityDetails(entityDetails, "remove");
      } else {
        updateSelectedEntityDetails(entityDetails, "add");
        handleActiveEntityChange(entityDetails, shouldScroll);
      }
    },
    [handleActiveEntityChange, isEntitySelected, updateSelectedEntityDetails]
  );

  /**
   * @description toggle entity selection
   * @param {React.MouseEvent} event
   * @param {string} entityID
   * @param {string} groupID
   */
  const handleEntityClick = useCallback(
    (e: React.MouseEvent, entityID: string, groupID: string) => {
      if (e.shiftKey && lastSelectedEntityDetails) {
        const currentEntityIndex = entitiesList.findIndex((entity) => entity?.entityID === entityID);

        const lastEntityIndex = entitiesList.findIndex(
          (entity) => entity?.entityID === lastSelectedEntityDetails.entityID
        );
        if (lastEntityIndex < currentEntityIndex) {
          for (let i = lastEntityIndex + 1; i <= currentEntityIndex; i++) {
            const entityDetails = entitiesList[i];
            if (entityDetails) {
              handleEntitySelection(entityDetails, false);
            }
          }
        } else if (lastEntityIndex > currentEntityIndex) {
          for (let i = currentEntityIndex; i <= lastEntityIndex - 1; i++) {
            const entityDetails = entitiesList[i];
            if (entityDetails) {
              handleEntitySelection(entityDetails, false);
            }
          }
        } else {
          const startIndex = lastEntityIndex + 1;
          const endIndex = currentEntityIndex;
          for (let i = startIndex; i <= endIndex; i++) {
            const entityDetails = entitiesList[i];
            if (entityDetails) {
              handleEntitySelection(entityDetails, false);
            }
          }
        }
        return;
      }

      handleEntitySelection({ entityID, groupID }, false);
    },
    [entitiesList, handleEntitySelection, lastSelectedEntityDetails]
  );

  /**
   * @description check if any entity of the group is selected
   * @param {string} groupID
   * @returns {boolean}
   */
  const isGroupSelected = useCallback(
    (groupID: string) => {
      const groupEntities = entitiesList.filter((entity) => entity.groupID === groupID);
      const totalSelected = groupEntities.filter((entity) => isEntitySelected(entity.entityID ?? "")).length;
      if (totalSelected === 0) return "empty";
      if (totalSelected === groupEntities.length) return "complete";
      return "partial";
    },
    [entitiesList, isEntitySelected]
  );

  /**
   * @description toggle group selection
   * @param {string} groupID
   */
  const handleGroupClick = useCallback(
    (groupID: string) => {
      const groupEntities = entitiesList.filter((entity) => entity.groupID === groupID);
      const groupSelectionStatus = isGroupSelected(groupID);
      groupEntities.forEach((entity) => {
        handleEntitySelection(entity, false, groupSelectionStatus === "empty" ? "force-add" : "force-remove");
      });
    },
    [entitiesList, handleEntitySelection, isGroupSelected]
  );

  // clear selection on escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearSelection]);

  // select entities on shift + arrow up/down key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;

      if (e.key === "ArrowDown" && activeEntityDetails) {
        if (!nextActiveEntity) return;
        // console.log("selected by down", elementDetails.entityID);
        handleEntitySelection(nextActiveEntity);
      }
      if (e.key === "ArrowUp" && activeEntityDetails) {
        if (!previousActiveEntity) return;
        // console.log("selected by up", elementDetails.entityID);
        handleEntitySelection(previousActiveEntity);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeEntityDetails,
    handleEntitySelection,
    lastSelectedEntityDetails?.entityID,
    nextActiveEntity,
    previousActiveEntity,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // set active entity id to the first entity
      if (["ArrowUp", "ArrowDown"].includes(e.key) && !activeEntityDetails) {
        const firstElementDetails = entitiesList[0];
        if (!firstElementDetails) return;
        handleActiveEntityChange(firstElementDetails);
      }

      if (e.key === "ArrowDown" && activeEntityDetails) {
        if (!activeEntityDetails) return;
        const { nextEntity: nextActiveEntity } = getPreviousAndNextEntities(activeEntityDetails.entityID);
        if (nextActiveEntity) {
          handleActiveEntityChange(nextActiveEntity);
        }
      }

      if (e.key === "ArrowUp" && activeEntityDetails) {
        if (!activeEntityDetails) return;
        const { previousEntity: previousActiveEntity } = getPreviousAndNextEntities(activeEntityDetails.entityID);
        if (previousActiveEntity) {
          handleActiveEntityChange(previousActiveEntity);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeEntityDetails, entitiesList, groups, getPreviousAndNextEntities, handleActiveEntityChange]);

  // clear selection on route change
  useEffect(() => {
    const handleRouteChange = () => clearSelection();

    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [clearSelection, router.events]);

  /**
   * @description snapshot of the current state of selection
   */
  const snapshot: TSelectionSnapshot = useMemo(
    () => ({
      isSelectionActive: selectedEntityDetails.length > 0,
      selectedEntityIds: selectedEntityDetails.map((en) => en.entityID),
    }),
    [selectedEntityDetails]
  );

  /**
   * @description helper functions for selection
   */
  const helpers: TSelectionHelper = useMemo(
    () => ({
      handleClearSelection: clearSelection,
      handleEntityClick,
      isEntitySelected,
      isEntityActive,
      handleGroupClick,
      isGroupSelected,
    }),
    [clearSelection, handleEntityClick, handleGroupClick, isEntityActive, isEntitySelected, isGroupSelected]
  );

  const returnValue = useMemo(
    () => ({
      helpers,
      snapshot,
    }),
    [helpers, snapshot]
  );

  return returnValue;
};