export declare class Action {
    private inputs;
    private azureClient;
    private stepCounter;
    private totalSteps;
    constructor();
    private getInputs;
    private logStep;
    private validateInputs;
    private initializeAzureClient;
    private setupNodeEnvironment;
    private deployCode;
    private deployContainer;
    private setAppVersion;
    private buildHealthCheckUrl;
    private healthCheckSlot;
    private swapSlots;
    private healthCheckProduction;
    private calculateTotalSteps;
    run(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map