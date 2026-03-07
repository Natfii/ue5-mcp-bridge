# Unreal Engine 5.7 Core API Reference

> **Note:** This is a condensed API reference. For authoritative signatures,
> clone the engine source (see CLAUDE.md setup instructions) or verify via
> official UE documentation.

## Class Hierarchy

```
UObject
├── AActor
│   ├── APawn
│   │   └── ACharacter
│   ├── AController
│   │   └── APlayerController
│   ├── AInfo
│   │   ├── AGameModeBase
│   │   │   └── AGameMode
│   │   ├── AGameStateBase
│   │   │   └── AGameState
│   │   └── APlayerState
│   ├── AHUD
│   ├── AVolume
│   │   └── ATriggerVolume
│   └── ALight
│       ├── APointLight
│       ├── ASpotLight
│       └── ADirectionalLight
├── UActorComponent
│   ├── USceneComponent
│   │   ├── UPrimitiveComponent
│   │   │   ├── UMeshComponent
│   │   │   │   ├── UStaticMeshComponent
│   │   │   │   └── USkeletalMeshComponent
│   │   │   ├── UShapeComponent
│   │   │   │   ├── UBoxComponent
│   │   │   │   ├── USphereComponent
│   │   │   │   └── UCapsuleComponent
│   │   │   └── UDecalComponent
│   │   ├── UCameraComponent
│   │   ├── USpringArmComponent
│   │   ├── UAudioComponent
│   │   ├── ULightComponent
│   │   │   ├── UPointLightComponent
│   │   │   ├── USpotLightComponent
│   │   │   └── UDirectionalLightComponent
│   │   ├── UArrowComponent
│   │   └── UChildActorComponent
│   ├── UMovementComponent
│   │   ├── UCharacterMovementComponent
│   │   ├── UProjectileMovementComponent
│   │   └── UFloatingPawnMovement
│   ├── UInputComponent
│   │   └── UEnhancedInputComponent
│   └── UWidgetComponent
├── USubsystem
│   ├── UWorldSubsystem
│   ├── UGameInstanceSubsystem
│   └── ULocalPlayerSubsystem
├── UGameInstance
├── UWorld
├── UAnimInstance
├── UBlueprintFunctionLibrary
├── UDataAsset
│   └── UPrimaryDataAsset
├── UVisual
│   └── UWidget
│       └── UUserWidget
└── UDeveloperSettings
```

## Common Structs

| Struct | Header | Description |
|--------|--------|-------------|
| `FVector` | `Math/Vector.h` | 3D vector (X, Y, Z as double in UE 5.x) |
| `FRotator` | `Math/Rotator.h` | Rotation (Pitch, Yaw, Roll in degrees) |
| `FTransform` | `Math/Transform.h` | Location + Rotation + Scale |
| `FQuat` | `Math/Quat.h` | Quaternion rotation |
| `FMatrix` | `Math/Matrix.h` | 4x4 transformation matrix |
| `FColor` | `Math/Color.h` | 8-bit RGBA color |
| `FLinearColor` | `Math/Color.h` | Float RGBA color (linear space) |
| `FHitResult` | `Engine/HitResult.h` | Trace/sweep hit data |
| `FActorSpawnParameters` | `Engine/World.h` | Parameters for SpawnActor |
| `FTimerHandle` | `Engine/TimerHandle.h` | Handle for timer management |
| `FName` | `UObject/NameTypes.h` | Immutable case-insensitive name |
| `FText` | `Internationalization/Text.h` | Localizable display text |
| `FString` | `Containers/UnrealString.h` | Mutable string |
| `FSoftObjectPath` | `UObject/SoftObjectPath.h` | Asset path for soft references |
| `FGameplayTag` | `GameplayTagContainer.h` | Hierarchical gameplay tag |
| `FLatentActionInfo` | `Engine/LatentActionManager.h` | Info for latent Blueprint actions |

## UPROPERTY Specifiers

### Visibility & Editability

| Specifier | Effect |
|-----------|--------|
| `EditAnywhere` | Editable in defaults and instances |
| `EditDefaultsOnly` | Editable in class defaults only |
| `EditInstanceOnly` | Editable on placed instances only |
| `VisibleAnywhere` | Read-only in defaults and instances |
| `VisibleDefaultsOnly` | Read-only in class defaults only |
| `VisibleInstanceOnly` | Read-only on placed instances only |

### Blueprint Access

| Specifier | Effect |
|-----------|--------|
| `BlueprintReadWrite` | Read and write from Blueprint |
| `BlueprintReadOnly` | Read-only from Blueprint |
| `BlueprintAssignable` | For multicast delegates — bind in BP |
| `BlueprintAuthorityOnly` | Only accessible on authority |
| `BlueprintCallable` | For multicast delegates — callable in BP |
| `BlueprintGetter` | Ties property to getter function |
| `BlueprintSetter` | Ties property to setter function |
| `EditFixedSize` | Array: prevent size changes, elements editable |

### Metadata & Behavior

| Specifier | Effect |
|-----------|--------|
| `Category = "Name"` | Details panel category |
| `meta = (AllowPrivateAccess = "true")` | Expose private member to BP |
| `meta = (ClampMin = "0", ClampMax = "100")` | Numeric slider range |
| `meta = (MakeStructureDefaultValue)` | Default value for struct pin |
| `meta = (ExposeOnSpawn)` | Show as pin on SpawnActor node |
| `Transient` | Not serialized (runtime-only) |
| `DuplicateTransient` | Not copied on duplication |
| `SaveGame` | Included in save game serialization |
| `Replicated` | Replicated to clients |
| `ReplicatedUsing = "OnRep_FuncName"` | Replicated with callback |
| `NotReplicated` | Skip replication for this property |
| `Interp` | Animatable via Sequencer |
| `Config` | Loaded from config file |
| `GlobalConfig` | Loaded from global config (not per-object) |
| `AdvancedDisplay` | Hidden under "Advanced" in Details |
| `AssetRegistrySearchable` | Indexed in asset registry |
| `SimpleDisplay` | Always visible (not under Advanced) |
| `NoClear` | Prevents "Clear" option on object references |
| `Export` | Inline-editable subobject |
| `Instanced` | Component-like per-instance subobject |
| `NonPIEDuplicateTransient` | Not copied except in PIE |
| `SkipSerialization` | Skips all serialization |

## UFUNCTION Specifiers

| Specifier | Effect |
|-----------|--------|
| `BlueprintCallable` | Callable from Blueprint (has exec pins) |
| `BlueprintPure` | Pure node — no exec pins, no side effects |
| `BlueprintImplementableEvent` | No C++ body — implement in Blueprint only |
| `BlueprintNativeEvent` | C++ default `_Implementation`, overridable in BP |
| `BlueprintAuthorityOnly` | Only executes on server |
| `BlueprintCosmetic` | Only executes on clients with viewport |
| `Category = "Name"` | Blueprint palette category |
| `CallInEditor` | Adds button in Details panel to call in-editor |
| `Exec` | Console command binding |
| `Server` | Server RPC |
| `Client` | Client RPC |
| `NetMulticast` | Multicast RPC |
| `Reliable` | Guaranteed delivery (RPC) |
| `Unreliable` | Best-effort delivery (RPC) |
| `WithValidation` | Requires `_Validate` function for RPC |
| `meta = (WorldContext = "WorldContextObject")` | Auto-fills world context pin |
| `meta = (DeterminesOutputType = "ParamName")` | Return type matches param class |
| `meta = (DisplayName = "Nice Name")` | Override display name in BP |
| `meta = (ExpandEnumAsExecs = "ParamName")` | Enum param becomes exec pins |
| `meta = (HidePin = "ParamName")` | Hide a parameter pin in BP |
| `meta = (DefaultToSelf = "ParamName")` | Auto-fill param with self ref |
| `meta = (CompactNodeTitle = "Short")` | Compact display in BP graph |
| `meta = (DeprecatedFunction)` | Mark as deprecated |
| `meta = (ReturnDisplayName = "Name")` | Label the return value pin |
| `BlueprintGetter` | Property getter function |
| `BlueprintSetter` | Property setter function |
| `SealedEvent` | Sealed blueprint event (cannot be overridden) |

## UCLASS Specifiers

| Specifier | Effect |
|-----------|--------|
| `Blueprintable` | Can create Blueprint subclass |
| `NotBlueprintable` | Cannot create Blueprint subclass |
| `BlueprintType` | Can be used as variable type in BP |
| `Abstract` | Cannot be instantiated |
| `MinimalAPI` | Only export type info (smaller DLL) |
| `ClassGroup = "Name"` | Group in editor class picker |
| `Within = OuterClassName` | Must be a subobject of outer class |
| `Transient` | Never saved to disk |
| `Config = ConfigName` | Config file binding |
| `HideCategories = (Cat1, Cat2)` | Hide categories in Details |
| `ShowCategories = (Cat1)` | Show previously hidden categories |
| `DefaultToInstanced` | Subobjects are per-instance |
| `EditInlineNew` | Allow inline subobject creation |
| `NotPlaceable` | Cannot be placed in a level |
| `Placeable` | Can be placed in a level |
| `Deprecated` | Class is deprecated |
| `meta = (ShortTooltip = "Brief")` | Short tooltip text |

## USTRUCT / UENUM

```cpp
USTRUCT(BlueprintType)
struct FMyStruct
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Value = 0.f;
};

UENUM(BlueprintType)
enum class EMyEnum : uint8
{
    None       UMETA(DisplayName = "None"),
    OptionA    UMETA(DisplayName = "Option A"),
    OptionB    UMETA(DisplayName = "Option B"),
};
```

## Common Include Paths

| Class/Type | Include |
|------------|---------|
| `AActor` | `#include "GameFramework/Actor.h"` |
| `APawn` | `#include "GameFramework/Pawn.h"` |
| `ACharacter` | `#include "GameFramework/Character.h"` |
| `APlayerController` | `#include "GameFramework/PlayerController.h"` |
| `AGameModeBase` | `#include "GameFramework/GameModeBase.h"` |
| `AGameStateBase` | `#include "GameFramework/GameStateBase.h"` |
| `APlayerState` | `#include "GameFramework/PlayerState.h"` |
| `UActorComponent` | `#include "Components/ActorComponent.h"` |
| `USceneComponent` | `#include "Components/SceneComponent.h"` |
| `UStaticMeshComponent` | `#include "Components/StaticMeshComponent.h"` |
| `USkeletalMeshComponent` | `#include "Components/SkeletalMeshComponent.h"` |
| `UCapsuleComponent` | `#include "Components/CapsuleComponent.h"` |
| `UBoxComponent` | `#include "Components/BoxComponent.h"` |
| `USphereComponent` | `#include "Components/SphereComponent.h"` |
| `UCameraComponent` | `#include "Camera/CameraComponent.h"` |
| `USpringArmComponent` | `#include "GameFramework/SpringArmComponent.h"` |
| `UCharacterMovementComponent` | `#include "GameFramework/CharacterMovementComponent.h"` |
| `UInputAction` | `#include "InputAction.h"` |
| `UInputMappingContext` | `#include "InputMappingContext.h"` |
| `UEnhancedInputComponent` | `#include "EnhancedInputComponent.h"` |
| `UAnimInstance` | `#include "Animation/AnimInstance.h"` |
| `UUserWidget` | `#include "Blueprint/UserWidget.h"` |
| `UWidgetComponent` | `#include "Components/WidgetComponent.h"` |
| `UDataAsset` | `#include "Engine/DataAsset.h"` |
| `UGameInstance` | `#include "Engine/GameInstance.h"` |
| `UWorld` | `#include "Engine/World.h"` |
| `UMaterialInstanceDynamic` | `#include "Materials/MaterialInstanceDynamic.h"` |
| `UNiagaraComponent` | `#include "NiagaraComponent.h"` |
| `FTimerManager` | `#include "TimerManager.h"` |
| `FGameplayTag` | `#include "GameplayTagContainer.h"` |

## Key Function Signatures

### AActor
```cpp
UWorld* GetWorld() const;
bool SetActorLocation(const FVector& NewLocation, bool bSweep = false, FHitResult* OutSweepHitResult = nullptr, ETeleportType Teleport = ETeleportType::None);
bool SetActorRotation(FRotator NewRotation, ETeleportType Teleport = ETeleportType::None);
bool SetActorTransform(const FTransform& NewTransform, bool bSweep = false, FHitResult* OutSweepHitResult = nullptr, ETeleportType Teleport = ETeleportType::None);
FVector GetActorLocation() const;
FRotator GetActorRotation() const;
FTransform GetActorTransform() const;
void AddActorWorldOffset(FVector DeltaLocation, bool bSweep = false, FHitResult* OutSweepResult = nullptr, ETeleportType Teleport = ETeleportType::None);
void AddActorWorldRotation(FRotator DeltaRotation, bool bSweep = false, FHitResult* OutSweepResult = nullptr, ETeleportType Teleport = ETeleportType::None);
void SetActorScale3D(FVector NewScale3D);
FVector GetActorScale3D() const;
void SetOwner(AActor* NewOwner);
AActor* GetOwner() const;
void SetLifeSpan(float InLifespan);
void Destroy(bool bNetForce = false, bool bShouldModifyLevel = true);
bool SetRootComponent(USceneComponent* NewRootComponent);
USceneComponent* GetRootComponent() const;
void SetActorHiddenInGame(bool bNewHidden);
void SetActorEnableCollision(bool bNewActorEnableCollision);
void SetActorTickEnabled(bool bEnabled);
AActor* GetAttachParentActor() const;
bool AttachToActor(AActor* ParentActor, const FAttachmentTransformRules& AttachmentRules, FName SocketName = NAME_None);
void DetachFromActor(const FDetachmentTransformRules& DetachmentRules);
```

### UActorComponent
```cpp
AActor* GetOwner() const;
UWorld* GetWorld() const;
void SetActive(bool bNewActive, bool bReset = false);
void Activate(bool bReset = false);
void Deactivate();
bool IsActive() const;
void SetComponentTickEnabled(bool bEnabled);
void DestroyComponent(bool bPromoteChildren = false);
void RegisterComponent();
void UnregisterComponent();
```

### USceneComponent
```cpp
void SetWorldLocation(FVector NewLocation, bool bSweep = false, FHitResult* OutSweepResult = nullptr, ETeleportType Teleport = ETeleportType::None);
void SetWorldRotation(FRotator NewRotation, bool bSweep = false, FHitResult* OutSweepResult = nullptr, ETeleportType Teleport = ETeleportType::None);
void SetRelativeLocation(FVector NewLocation, bool bSweep = false, FHitResult* OutSweepResult = nullptr, ETeleportType Teleport = ETeleportType::None);
FVector GetComponentLocation() const;
FRotator GetComponentRotation() const;
FTransform GetComponentTransform() const;
void SetVisibility(bool bNewVisibility, bool bPropagateToChildren = false);
void SetHiddenInGame(bool NewHidden, bool bPropagateToChildren = false);
void AttachToComponent(USceneComponent* Parent, const FAttachmentTransformRules& AttachmentRules, FName SocketName = NAME_None);
```

### UWorld
```cpp
template<class T> T* SpawnActor(UClass* Class, const FVector& Location, const FRotator& Rotation, const FActorSpawnParameters& SpawnParameters = FActorSpawnParameters());
template<class T> T* SpawnActorDeferred(UClass* Class, const FTransform& Transform, AActor* Owner = nullptr, APawn* Instigator = nullptr, ESpawnActorCollisionHandlingMethod CollisionHandling = ESpawnActorCollisionHandlingMethod::Undefined);
FTimerManager& GetTimerManager() const;
AGameModeBase* GetAuthGameMode() const;
AGameStateBase* GetGameState() const;
bool LineTraceSingleByChannel(FHitResult& OutHit, const FVector& Start, const FVector& End, ECollisionChannel TraceChannel, const FCollisionQueryParams& Params = FCollisionQueryParams::DefaultQueryParam) const;
```

### Component Retrieval
```cpp
// On AActor:
template<class T> T* FindComponentByClass() const;
template<class T> T* GetComponentByClass() const;  // alias
template<class T> TArray<T*> GetComponentsByClass() const;  // K2 version, returns copies
void GetComponents(TArray<UActorComponent*>& OutComponents) const;

// Create at runtime:
template<class T> T* CreateDefaultSubobject(FName SubobjectName, bool bTransient = false);  // constructor only
UActorComponent* AddComponentByClass(TSubclassOf<UActorComponent> Class, bool bManualAttachment, const FTransform& RelativeTransform, bool bDeferredFinish);
```
