import concat from "lodash/concat";
import pull from "lodash/pull";
import set from "lodash/set";
import update from "lodash/update";
import { action, makeObservable, observable, runInAction, computed } from "mobx";
// types
import {
  TIssue,
  TGroupedIssues,
  TSubGroupedIssues,
  TLoader,
  TUnGroupedIssues,
  ViewFlags,
  TBulkOperationsPayload,
} from "@plane/types";
// helpers
import { issueCountBasedOnFilters } from "@/helpers/issue.helper";
// base class
import { IssueService, IssueArchiveService } from "@/services/issue";
import { IssueHelperStore } from "../helpers/issue-helper.store";
// services
import { IIssueRootStore } from "../root.store";

export interface IProjectIssues {
  // observable
  loader: TLoader;
  issues: Record<string, string[]>; // Record of project_id as key and issue_ids as value
  viewFlags: ViewFlags;
  // computed
  issuesCount: number;
  groupedIssueIds: TGroupedIssues | TSubGroupedIssues | TUnGroupedIssues | undefined;
  getIssueIds: (groupId?: string, subGroupId?: string) => string[] | undefined;
  // action
  fetchIssues: (workspaceSlug: string, projectId: string, loadType: TLoader) => Promise<TIssue[]>;
  createIssue: (workspaceSlug: string, projectId: string, data: Partial<TIssue>) => Promise<TIssue>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  removeIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  archiveIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  quickAddIssue: (workspaceSlug: string, projectId: string, data: TIssue) => Promise<TIssue>;
  removeBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  archiveBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  bulkUpdateProperties: (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => Promise<void>;
}

export class ProjectIssues extends IssueHelperStore implements IProjectIssues {
  // observable
  loader: TLoader = "init-loader";
  issues: Record<string, string[]> = {};
  viewFlags = {
    enableQuickAdd: true,
    enableIssueCreation: true,
    enableInlineEditing: true,
  };
  // root store
  rootIssueStore: IIssueRootStore;
  // services
  issueService;
  issueArchiveService;

  constructor(_rootStore: IIssueRootStore) {
    super(_rootStore);
    makeObservable(this, {
      // observable
      loader: observable.ref,
      issues: observable,
      // computed
      issuesCount: computed,
      groupedIssueIds: computed,
      // action
      fetchIssues: action,
      createIssue: action,
      updateIssue: action,
      removeIssue: action,
      archiveIssue: action,
      removeBulkIssues: action,
      archiveBulkIssues: action,
      bulkUpdateProperties: action,
      quickAddIssue: action,
    });
    // root store
    this.rootIssueStore = _rootStore;
    // services
    this.issueService = new IssueService();
    this.issueArchiveService = new IssueArchiveService();
  }

  get issuesCount() {
    let issuesCount = 0;

    const displayFilters = this.rootStore?.projectIssuesFilter?.issueFilters?.displayFilters;
    const groupedIssueIds = this.groupedIssueIds;
    if (!displayFilters || !groupedIssueIds) return issuesCount;

    const layout = displayFilters?.layout || undefined;
    const groupBy = displayFilters?.group_by || undefined;
    const subGroupBy = displayFilters?.sub_group_by || undefined;

    if (!layout) return issuesCount;
    issuesCount = issueCountBasedOnFilters(groupedIssueIds, layout, groupBy, subGroupBy);
    return issuesCount;
  }

  get groupedIssueIds() {
    const projectId = this.rootStore?.projectId;
    if (!projectId) return undefined;

    const displayFilters = this.rootStore?.projectIssuesFilter?.issueFilters?.displayFilters;
    if (!displayFilters) return undefined;

    const subGroupBy = displayFilters?.sub_group_by;
    const groupBy = displayFilters?.group_by;
    const orderBy = displayFilters?.order_by;
    const layout = displayFilters?.layout;

    const projectIssueIds = this.issues[projectId];
    if (!projectIssueIds) return;

    const currentIssues = this.rootStore.issues.getIssuesByIds(projectIssueIds, "un-archived");
    if (!currentIssues) return [];

    let issues: TGroupedIssues | TSubGroupedIssues | TUnGroupedIssues = [];

    if (layout === "list" && orderBy) {
      if (groupBy) issues = this.groupedIssues(groupBy, orderBy, currentIssues);
      else issues = this.unGroupedIssues(orderBy, currentIssues);
    } else if (layout === "kanban" && groupBy && orderBy) {
      if (subGroupBy) issues = this.subGroupedIssues(subGroupBy, groupBy, orderBy, currentIssues);
      else issues = this.groupedIssues(groupBy, orderBy, currentIssues);
    } else if (layout === "calendar") issues = this.groupedIssues("target_date", "target_date", currentIssues, true);
    else if (layout === "spreadsheet") issues = this.unGroupedIssues(orderBy ?? "-created_at", currentIssues);
    else if (layout === "gantt_chart") issues = this.unGroupedIssues(orderBy ?? "sort_order", currentIssues);

    return issues;
  }

  getIssueIds = (groupId?: string, subGroupId?: string) => {
    const groupedIssueIds = this.groupedIssueIds;

    const displayFilters = this.rootStore?.projectIssuesFilter?.issueFilters?.displayFilters;
    if (!displayFilters || !groupedIssueIds) return undefined;

    const subGroupBy = displayFilters?.sub_group_by;
    const groupBy = displayFilters?.group_by;

    if (!groupBy && !subGroupBy) {
      return groupedIssueIds as string[];
    }

    if (groupBy && subGroupBy && groupId && subGroupId) {
      return (groupedIssueIds as TSubGroupedIssues)?.[subGroupId]?.[groupId] as string[];
    }

    if (groupBy && groupId) {
      return (groupedIssueIds as TGroupedIssues)?.[groupId] as string[];
    }

    return undefined;
  };

  fetchIssues = async (workspaceSlug: string, projectId: string, loadType: TLoader = "init-loader") => {
    try {
      this.loader = loadType;

      const params = this.rootStore?.projectIssuesFilter?.appliedFilters;
      const response = await this.issueService.getIssues(workspaceSlug, projectId, params);

      runInAction(() => {
        set(
          this.issues,
          [projectId],
          response.map((issue) => issue.id)
        );
        this.loader = undefined;
      });

      this.rootStore.issues.addIssue(response);
      this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);

      return response;
    } catch (error) {
      this.loader = undefined;
      throw error;
    }
  };

  createIssue = async (workspaceSlug: string, projectId: string, data: Partial<TIssue>) => {
    try {
      const response = await this.issueService.createIssue(workspaceSlug, projectId, data);

      runInAction(() => {
        update(this.issues, [projectId], (issueIds) => {
          if (!issueIds) return [response.id];
          return concat(issueIds, response.id);
        });
      });

      this.rootStore.issues.addIssue([response]);
      this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);

      return response;
    } catch (error) {
      throw error;
    }
  };

  updateIssue = async (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => {
    try {
      this.rootStore.issues.updateIssue(issueId, data);

      await this.issueService.patchIssue(workspaceSlug, projectId, issueId, data);
    } catch (error) {
      this.fetchIssues(workspaceSlug, projectId, "mutation");
      throw error;
    }
  };

  removeIssue = async (workspaceSlug: string, projectId: string, issueId: string) => {
    try {
      await this.issueService.deleteIssue(workspaceSlug, projectId, issueId);

      runInAction(() => {
        pull(this.issues[projectId], issueId);
      });

      this.rootStore.issues.removeIssue(issueId);
      this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);
    } catch (error) {
      throw error;
    }
  };

  archiveIssue = async (workspaceSlug: string, projectId: string, issueId: string) => {
    try {
      const response = await this.issueArchiveService.archiveIssue(workspaceSlug, projectId, issueId);

      runInAction(() => {
        this.rootStore.issues.updateIssue(issueId, {
          archived_at: response.archived_at,
        });
        pull(this.issues[projectId], issueId);
      });

      this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);
    } catch (error) {
      throw error;
    }
  };

  quickAddIssue = async (workspaceSlug: string, projectId: string, data: TIssue) => {
    try {
      runInAction(() => {
        this.issues[projectId].push(data.id);
        this.rootStore.issues.addIssue([data]);
      });

      const response = await this.createIssue(workspaceSlug, projectId, data);

      const quickAddIssueIndex = this.issues[projectId].findIndex((_issueId) => _issueId === data.id);

      if (quickAddIssueIndex >= 0) {
        runInAction(() => {
          this.issues[projectId].splice(quickAddIssueIndex, 1);
          this.rootStore.issues.removeIssue(data.id);
        });
      }

      const currentCycleId = data.cycle_id !== "" && data.cycle_id === "None" ? undefined : data.cycle_id;
      const currentModuleIds =
        data.module_ids && data.module_ids.length > 0 ? data.module_ids.filter((moduleId) => moduleId != "None") : [];

      const multipleIssuePromises = [];
      if (currentCycleId) {
        multipleIssuePromises.push(
          this.rootStore.cycleIssues.addCycleToIssue(workspaceSlug, projectId, currentCycleId, response.id)
        );
      }

      if (currentModuleIds.length > 0) {
        multipleIssuePromises.push(
          this.rootStore.moduleIssues.changeModulesInIssue(workspaceSlug, projectId, response.id, currentModuleIds, [])
        );
      }

      if (multipleIssuePromises && multipleIssuePromises.length > 0) {
        await Promise.all(multipleIssuePromises);
      }

      return response;
    } catch (error) {
      this.fetchIssues(workspaceSlug, projectId, "mutation");
      throw error;
    }
  };

  removeBulkIssues = async (workspaceSlug: string, projectId: string, issueIds: string[]) => {
    try {
      runInAction(() => {
        issueIds.forEach((issueId) => {
          pull(this.issues[projectId], issueId);
          this.rootStore.issues.removeIssue(issueId);
        });
      });

      const response = await this.issueService.bulkDeleteIssues(workspaceSlug, projectId, { issue_ids: issueIds });
      this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);

      return response;
    } catch (error) {
      this.fetchIssues(workspaceSlug, projectId, "mutation");
      throw error;
    }
  };

  archiveBulkIssues = async (workspaceSlug: string, projectId: string, issueIds: string[]) => {
    try {
      const response = await this.issueService.bulkArchiveIssues(workspaceSlug, projectId, { issue_ids: issueIds });

      runInAction(() => {
        issueIds.forEach((issueId) => {
          this.rootStore.issues.updateIssue(issueId, {
            archived_at: response.archived_at,
          });
        });
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * @description bulk update properties of selected issues
   * @param {TBulkOperationsPayload} data
   */
  bulkUpdateProperties = async (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => {
    const issueIds = data.issue_ids;
    try {
      // make request to update issue properties
      await this.issueService.bulkOperations(workspaceSlug, projectId, data);
      // update issues in the store
      runInAction(() => {
        issueIds.forEach((issueId) => {
          const issueDetails = this.rootIssueStore.issues.getIssueById(issueId);
          if (!issueDetails) throw new Error("Issue not found");
          Object.keys(data.properties).forEach((key) => {
            const property = key as keyof TBulkOperationsPayload["properties"];
            const propertyValue = data.properties[property];
            // update root issue map properties
            if (Array.isArray(propertyValue)) {
              // if property value is array, append it to the existing values
              const existingValue = issueDetails[property];
              // convert existing value to an array
              const newExistingValue = Array.isArray(existingValue) ? existingValue : [];
              this.rootIssueStore.issues.updateIssue(issueId, {
                [property]: [newExistingValue, ...propertyValue],
              });
            } else {
              // if property value is not an array, simply update the value
              this.rootIssueStore.issues.updateIssue(issueId, {
                [property]: propertyValue,
              });
            }
          });
        });
      });
    } catch (error) {
      throw error;
    }
  };
}
