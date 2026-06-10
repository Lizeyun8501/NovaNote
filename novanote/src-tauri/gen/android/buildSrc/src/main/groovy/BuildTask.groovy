import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

class BuildTask extends DefaultTask {
    @Input
    String rootDirRel
    @Input
    String target
    @Input
    Boolean release

    @TaskAction
    void assemble() {
        def executable = "pnpm"
        try {
            runTauriCli(executable)
        } catch (e) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                def fallbacks = [
                    "${executable}.exe",
                    "${executable}.cmd",
                    "${executable}.bat",
                ]
                def lastException = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e
            }
        }
    }

    void runTauriCli(String executable) {
        if (rootDirRel == null) throw new GradleException("rootDirRel cannot be null")
        if (target == null) throw new GradleException("target cannot be null")
        if (release == null) throw new GradleException("release cannot be null")
        def args = ['tauri', 'android', 'android-studio-script']

        project.exec {
            workingDir(new File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args('-vv')
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args('-v')
            }
            if (release) {
                args('--release')
            }
            args(['--target', target])
        }.assertNormalExitValue()
    }
}
