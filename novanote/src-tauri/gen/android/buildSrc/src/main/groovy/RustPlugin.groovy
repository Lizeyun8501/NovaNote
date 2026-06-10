import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.Plugin
import org.gradle.api.Project

class Config {
    String rootDirRel
}

class RustPlugin implements Plugin<Project> {
    void apply(Project project) {
        def config = project.extensions.create('rust', Config)

        def defaultAbiList = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']
        def abiList = project.findProperty('abiList')?.split(',') ?: defaultAbiList

        def defaultArchList = ['arm64', 'arm', 'x86', 'x86_64']
        def archList = project.findProperty('archList')?.split(',') ?: defaultArchList

        def targetsList = project.findProperty('targetList')?.split(',') ?: ['aarch64', 'armv7', 'i686', 'x86_64']

        project.extensions.configure(ApplicationExtension) {
            flavorDimensions.add('abi')
            productFlavors {
                create('universal') {
                    dimension = 'abi'
                    ndk {
                        abiFilters.addAll(abiList)
                    }
                }
                defaultArchList.eachWithIndex { arch, index ->
                    create(arch) {
                        dimension = 'abi'
                        ndk {
                            abiFilters.add(defaultAbiList[index])
                        }
                    }
                }
            }
        }

        project.afterEvaluate {
            for (profile in ['debug', 'release']) {
                def profileCapitalized = profile.capitalize()
                def buildTask = project.tasks.maybeCreate(
                    "rustBuildUniversal${profileCapitalized}"
                )
                buildTask.group = 'rust'
                buildTask.description = "Build dynamic library in $profile mode for all targets"

                project.tasks["mergeUniversal${profileCapitalized}JniLibFolders"].dependsOn(buildTask)

                targetsList.eachWithIndex { targetName, index ->
                    def targetArch = archList[index]
                    def targetArchCapitalized = targetArch.capitalize()
                    def targetBuildTask = project.tasks.maybeCreate(
                        "rustBuild${targetArchCapitalized}${profileCapitalized}",
                        BuildTask
                    )
                    targetBuildTask.group = 'rust'
                    targetBuildTask.description = "Build dynamic library in $profile mode for $targetArch"
                    targetBuildTask.rootDirRel = config.rootDirRel
                    targetBuildTask.target = targetName
                    targetBuildTask.release = (profile == 'release')

                    buildTask.dependsOn(targetBuildTask)
                    project.tasks["merge${targetArchCapitalized}${profileCapitalized}JniLibFolders"].dependsOn(targetBuildTask)
                }
            }
        }
    }
}
